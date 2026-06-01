const express = require("express");
const admin = require("firebase-admin");
const { db } = require("../firebaseAdmin");
const authMiddleware = require("../authMiddleware");
const { normalizePlanId, resolvePlan } = require("../config/subscriptionPlans");

const router = express.Router();

router.use(authMiddleware);

const WORKSPACE_ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  EDITOR: "editor",
  VIEWER: "viewer",
};

async function getUserPlanSeatLimit(userId) {
  const userDoc = await db.collection("users").doc(userId).get();
  const userData = userDoc.exists ? userDoc.data() : {};
  const rawPlanId =
    userData?.subscriptionPlan ||
    userData?.subscription?.planId ||
    userData?.plan?.tier ||
    "free";
  const planId = normalizePlanId(rawPlanId);
  const plan = resolvePlan(planId);
  const seatLimit = Number(plan?.features?.teamSeats || 1);
  return {
    planId,
    seatLimit: Number.isFinite(seatLimit) && seatLimit > 0 ? seatLimit : 1,
    planName: plan?.name || "Starter",
  };
}

async function getWorkspaceMember(workspaceId, uid) {
  const memberDoc = await db
    .collection("workspaces")
    .doc(workspaceId)
    .collection("members")
    .doc(uid)
    .get();

  return memberDoc.exists ? memberDoc.data() : null;
}

async function requireWorkspaceRole(req, res, next) {
  try {
    const { id } = req.params;
    const workspaceId = id || req.params.workspaceId;
    if (!workspaceId) return res.status(400).json({ ok: false, error: "workspaceId required" });

    const uid = req.userId || (req.user && req.user.uid);
    if (!uid) return res.status(401).json({ ok: false, error: "unauthorized" });

    const workspaceDoc = await db.collection("workspaces").doc(workspaceId).get();
    if (!workspaceDoc.exists) return res.status(404).json({ ok: false, error: "workspace_not_found" });

    const workspace = workspaceDoc.data() || {};
    const isOwner = workspace.ownerUid === uid;
    const member = isOwner
      ? { role: WORKSPACE_ROLES.OWNER, status: "active" }
      : await getWorkspaceMember(workspaceId, uid);

    if (!member || member.status !== "active") {
      return res.status(403).json({ ok: false, error: "not_a_workspace_member" });
    }

    req.workspaceId = workspaceId;
    req.workspace = workspace;
    req.workspaceMembership = member;
    req.isWorkspaceOwner = isOwner;
    next();
  } catch (error) {
    console.error("[workspace] role check failed:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}

// Create workspace for current user
router.post("/", async (req, res) => {
  try {
    const uid = req.userId || (req.user && req.user.uid);
    const email = req.user?.email || null;
    const { name } = req.body || {};

    const existing = await db.collection("workspaces").where("ownerUid", "==", uid).limit(1).get();
    if (!existing.empty) {
      return res.status(400).json({ ok: false, error: "workspace_already_exists" });
    }

    const { planId, seatLimit, planName } = await getUserPlanSeatLimit(uid);
    const workspaceRef = db.collection("workspaces").doc();

    await workspaceRef.set({
      id: workspaceRef.id,
      name: name || `${planName} Workspace`,
      ownerUid: uid,
      ownerEmail: email,
      planId,
      seatLimit,
      usedSeats: 1,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await workspaceRef.collection("members").doc(uid).set({
      uid,
      email,
      role: WORKSPACE_ROLES.OWNER,
      status: "active",
      invitedBy: uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ ok: true, workspaceId: workspaceRef.id });
  } catch (error) {
    console.error("[workspace] create failed:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// Get current user's owned workspace or first active membership
router.get("/current", async (req, res) => {
  try {
    const uid = req.userId || (req.user && req.user.uid);

    let workspaceDoc = null;
    const owned = await db.collection("workspaces").where("ownerUid", "==", uid).limit(1).get();
    if (!owned.empty) {
      workspaceDoc = owned.docs[0];
    } else {
      const membership = await db
        .collectionGroup("members")
        .where("uid", "==", uid)
        .where("status", "==", "active")
        .limit(1)
        .get();
      if (!membership.empty) {
        const parentWorkspaceRef = membership.docs[0].ref.parent.parent;
        if (parentWorkspaceRef) {
          workspaceDoc = await parentWorkspaceRef.get();
        }
      }
    }

    if (!workspaceDoc || !workspaceDoc.exists) {
      return res.status(404).json({ ok: false, error: "workspace_not_found" });
    }

    const workspace = workspaceDoc.data() || {};
    const membersSnap = await workspaceDoc.ref.collection("members").where("status", "==", "active").get();
    const members = membersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    return res.json({
      ok: true,
      workspace: {
        ...workspace,
        id: workspaceDoc.id,
        usedSeats: members.length,
        remainingSeats: Math.max(0, Number(workspace.seatLimit || 1) - members.length),
      },
      members,
    });
  } catch (error) {
    console.error("[workspace] current failed:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// Invite member
router.post("/:id/invite", requireWorkspaceRole, async (req, res) => {
  try {
    const { email, role } = req.body || {};
    const inviterUid = req.userId || (req.user && req.user.uid);

    const memberRole = req.workspaceMembership.role;
    if (![WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN].includes(memberRole)) {
      return res.status(403).json({ ok: false, error: "insufficient_permissions" });
    }

    if (!email || typeof email !== "string") {
      return res.status(400).json({ ok: false, error: "valid_email_required" });
    }

    const normalizedRole = [WORKSPACE_ROLES.ADMIN, WORKSPACE_ROLES.EDITOR, WORKSPACE_ROLES.VIEWER].includes(role)
      ? role
      : WORKSPACE_ROLES.EDITOR;

    const workspaceRef = db.collection("workspaces").doc(req.workspaceId);
    const membersSnap = await workspaceRef.collection("members").where("status", "==", "active").get();
    const currentSeats = membersSnap.size;
    const seatLimit = Number(req.workspace.seatLimit || 1);

    if (currentSeats >= seatLimit) {
      return res.status(409).json({
        ok: false,
        error: "seat_limit_reached",
        seatLimit,
        usedSeats: currentSeats,
      });
    }

    const inviteRef = workspaceRef.collection("invites").doc();
    await inviteRef.set({
      id: inviteRef.id,
      email: email.trim().toLowerCase(),
      role: normalizedRole,
      status: "pending",
      invitedBy: inviterUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ ok: true, inviteId: inviteRef.id });
  } catch (error) {
    console.error("[workspace] invite failed:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// Accept invite (atomic seat enforcement)
router.post("/:id/invite/:inviteId/accept", async (req, res) => {
  try {
    const uid = req.userId || (req.user && req.user.uid);
    const email = (req.user?.email || "").toLowerCase();
    const { id, inviteId } = req.params;

    const workspaceRef = db.collection("workspaces").doc(id);
    const inviteRef = workspaceRef.collection("invites").doc(inviteId);
    const memberRef = workspaceRef.collection("members").doc(uid);

    await db.runTransaction(async tx => {
      const [workspaceDoc, inviteDoc, memberDoc] = await Promise.all([
        tx.get(workspaceRef),
        tx.get(inviteRef),
        tx.get(memberRef),
      ]);

      if (!workspaceDoc.exists) throw new Error("workspace_not_found");
      if (!inviteDoc.exists) throw new Error("invite_not_found");

      const workspace = workspaceDoc.data() || {};
      const invite = inviteDoc.data() || {};
      const seatLimit = Number(workspace.seatLimit || 1);

      if (invite.status !== "pending") throw new Error("invite_not_pending");
      if (invite.email !== email) throw new Error("invite_email_mismatch");
      if (memberDoc.exists && memberDoc.data()?.status === "active") throw new Error("already_member");

      const activeMembersSnap = await tx.get(
        workspaceRef.collection("members").where("status", "==", "active")
      );

      if (activeMembersSnap.size >= seatLimit) throw new Error("seat_limit_reached");

      tx.set(memberRef, {
        uid,
        email,
        role: invite.role || WORKSPACE_ROLES.EDITOR,
        status: "active",
        invitedBy: invite.invitedBy || null,
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      tx.update(inviteRef, {
        status: "accepted",
        acceptedBy: uid,
        acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      tx.update(workspaceRef, {
        usedSeats: activeMembersSnap.size + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return res.json({ ok: true });
  } catch (error) {
    const known = [
      "workspace_not_found",
      "invite_not_found",
      "invite_not_pending",
      "invite_email_mismatch",
      "already_member",
      "seat_limit_reached",
    ];
    if (known.includes(error.message)) {
      return res.status(400).json({ ok: false, error: error.message });
    }
    console.error("[workspace] accept invite failed:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// Remove member
router.delete("/:id/members/:uid", requireWorkspaceRole, async (req, res) => {
  try {
    const targetUid = req.params.uid;
    const actorUid = req.userId || (req.user && req.user.uid);
    const actorRole = req.workspaceMembership.role;

    if (![WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN].includes(actorRole)) {
      return res.status(403).json({ ok: false, error: "insufficient_permissions" });
    }

    if (targetUid === req.workspace.ownerUid) {
      return res.status(400).json({ ok: false, error: "cannot_remove_owner" });
    }

    const workspaceRef = db.collection("workspaces").doc(req.workspaceId);
    const memberRef = workspaceRef.collection("members").doc(targetUid);

    await db.runTransaction(async tx => {
      const [workspaceDoc, memberDoc] = await Promise.all([tx.get(workspaceRef), tx.get(memberRef)]);
      if (!workspaceDoc.exists) throw new Error("workspace_not_found");
      if (!memberDoc.exists) throw new Error("member_not_found");

      const member = memberDoc.data() || {};
      if (member.status !== "active") throw new Error("member_not_active");

      tx.update(memberRef, {
        status: "removed",
        removedBy: actorUid,
        removedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const currentUsedSeats = Number(workspaceDoc.data()?.usedSeats || 1);
      tx.update(workspaceRef, {
        usedSeats: Math.max(1, currentUsedSeats - 1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return res.json({ ok: true });
  } catch (error) {
    const known = ["workspace_not_found", "member_not_found", "member_not_active"];
    if (known.includes(error.message)) {
      return res.status(400).json({ ok: false, error: error.message });
    }
    console.error("[workspace] remove member failed:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// Update member role
router.patch("/:id/members/:uid/role", requireWorkspaceRole, async (req, res) => {
  try {
    const actorRole = req.workspaceMembership.role;
    if (![WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN].includes(actorRole)) {
      return res.status(403).json({ ok: false, error: "insufficient_permissions" });
    }

    const targetUid = req.params.uid;
    const { role } = req.body || {};
    const allowed = [WORKSPACE_ROLES.ADMIN, WORKSPACE_ROLES.EDITOR, WORKSPACE_ROLES.VIEWER];
    if (!allowed.includes(role)) {
      return res.status(400).json({ ok: false, error: "invalid_role" });
    }

    if (targetUid === req.workspace.ownerUid) {
      return res.status(400).json({ ok: false, error: "cannot_change_owner_role" });
    }

    const memberRef = db.collection("workspaces").doc(req.workspaceId).collection("members").doc(targetUid);
    const memberDoc = await memberRef.get();
    if (!memberDoc.exists || memberDoc.data()?.status !== "active") {
      return res.status(404).json({ ok: false, error: "member_not_found" });
    }

    await memberRef.update({
      role,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ ok: true });
  } catch (error) {
    console.error("[workspace] update role failed:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

module.exports = router;
