const express = require("express");
const admin = require("firebase-admin");
const crypto = require("crypto");
const { db } = require("../firebaseAdmin");
const authMiddleware = require("../authMiddleware");
const { normalizePlanId, resolvePlan } = require("../config/subscriptionPlans");
const { sendWorkspaceInvitation } = require("../services/emailService");
const { isValidWorkspaceInviteEmail } = require("../utils/emailValidation");

const router = express.Router();

const WORKSPACE_ROLES = {
  OWNER: "owner",
  ADMIN: "admin",
  EDITOR: "editor",
  VIEWER: "viewer",
};
const INVITE_TTL_DAYS = Math.max(1, parseInt(process.env.WORKSPACE_INVITE_TTL_DAYS || "7", 10));

function hashInviteToken(token) {
  return crypto
    .createHash("sha256")
    .update(String(token || ""))
    .digest("hex");
}

function timestampToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isInviteExpired(invite) {
  const expiresAt = timestampToMillis(invite?.expiresAt);
  return !expiresAt || expiresAt <= Date.now();
}

function getPublicAppUrl() {
  return String(
    process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || "https://www.autopromote.org"
  ).replace(/\/$/, "");
}

function maskInviteEmail(email) {
  const normalized = String(email || "")
    .trim()
    .toLowerCase();
  const separator = normalized.lastIndexOf("@");
  if (separator <= 0) return "the email address that received this invitation";

  const local = normalized.slice(0, separator);
  const domain = normalized.slice(separator + 1);
  const visibleLocal =
    local.length <= 2
      ? `${local[0] || ""}*`
      : `${local[0]}${"*".repeat(Math.min(4, local.length - 2))}${local.at(-1)}`;
  return `${visibleLocal}@${domain}`;
}

// Let a signed-out invitee understand where the invitation leads without
// exposing member data. The high-entropy invitation token is required and is
// compared with the same timing-safe check used during acceptance.
router.get("/:id/invite/:inviteId/preview", async (req, res) => {
  try {
    const { id, inviteId } = req.params;
    const inviteToken = String(req.query?.token || "");
    if (!inviteToken) {
      return res.status(400).json({ ok: false, error: "invite_token_required" });
    }

    const workspaceRef = db.collection("workspaces").doc(id);
    const [workspaceDoc, inviteDoc] = await Promise.all([
      workspaceRef.get(),
      workspaceRef.collection("invites").doc(inviteId).get(),
    ]);
    if (!workspaceDoc.exists || !inviteDoc.exists) {
      return res.status(404).json({ ok: false, error: "invite_not_found" });
    }

    const invite = inviteDoc.data() || {};
    const suppliedHash = hashInviteToken(inviteToken);
    if (
      !invite.tokenHash ||
      invite.tokenHash.length !== suppliedHash.length ||
      !crypto.timingSafeEqual(Buffer.from(invite.tokenHash), Buffer.from(suppliedHash))
    ) {
      return res.status(404).json({ ok: false, error: "invite_not_found" });
    }
    if (invite.status !== "pending") {
      return res.status(410).json({ ok: false, error: "invite_not_pending" });
    }
    if (isInviteExpired(invite)) {
      return res.status(410).json({ ok: false, error: "invite_expired" });
    }

    const expiresAtMs = timestampToMillis(invite.expiresAt);
    return res.json({
      ok: true,
      workspaceName: String(workspaceDoc.data()?.name || "AutoPromote Workspace").slice(0, 80),
      role: invite.role || WORKSPACE_ROLES.EDITOR,
      maskedEmail: maskInviteEmail(invite.email),
      expiresAt: new Date(expiresAtMs).toISOString(),
    });
  } catch (error) {
    console.error("[workspace] invite preview failed:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

router.use(authMiddleware);

async function getUserPlanSeatLimit(userId) {
  const userDoc = await db.collection("users").doc(userId).get();
  const userData = userDoc.exists ? userDoc.data() : {};
  const rawPlanId =
    userData?.subscriptionPlan || userData?.subscription?.planId || userData?.plan?.tier || "free";
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

async function getEffectiveWorkspacePlan(workspace) {
  const ownerUid = workspace?.ownerUid;
  if (!ownerUid) return { planId: "free", seatLimit: 1, planName: "Starter" };
  return getUserPlanSeatLimit(ownerUid);
}

async function requireWorkspaceRole(req, res, next) {
  try {
    const { id } = req.params;
    const workspaceId = id || req.params.workspaceId;
    if (!workspaceId) return res.status(400).json({ ok: false, error: "workspaceId required" });

    const uid = req.userId || (req.user && req.user.uid);
    if (!uid) return res.status(401).json({ ok: false, error: "unauthorized" });

    const workspaceDoc = await db.collection("workspaces").doc(workspaceId).get();
    if (!workspaceDoc.exists)
      return res.status(404).json({ ok: false, error: "workspace_not_found" });

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
    const requestedName = String(req.body?.name || "")
      .trim()
      .slice(0, 80);

    const existing = await db.collection("workspaces").where("ownerUid", "==", uid).limit(1).get();
    if (!existing.empty) {
      return res.status(400).json({ ok: false, error: "workspace_already_exists" });
    }

    const { planId, seatLimit, planName } = await getUserPlanSeatLimit(uid);
    const workspaceRef = db.collection("workspaces").doc();

    await workspaceRef.set({
      id: workspaceRef.id,
      name: requestedName || `${planName} Workspace`,
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

// List every workspace the current user can access.
router.get("/", async (req, res) => {
  try {
    const uid = req.userId || req.user?.uid;
    const [owned, memberships] = await Promise.all([
      db.collection("workspaces").where("ownerUid", "==", uid).get(),
      db.collectionGroup("members").where("uid", "==", uid).where("status", "==", "active").get(),
    ]);

    const refs = new Map();
    owned.docs.forEach(doc => refs.set(doc.id, doc.ref));
    memberships.docs.forEach(doc => {
      const workspaceRef = doc.ref.parent.parent;
      if (workspaceRef) refs.set(workspaceRef.id, workspaceRef);
    });

    const workspaces = await Promise.all(
      [...refs.values()].map(async ref => {
        const [workspaceDoc, memberDoc] = await Promise.all([
          ref.get(),
          ref.collection("members").doc(uid).get(),
        ]);
        if (!workspaceDoc.exists) return null;
        const workspace = workspaceDoc.data() || {};
        const role = workspace.ownerUid === uid ? WORKSPACE_ROLES.OWNER : memberDoc.data()?.role;
        return { id: workspaceDoc.id, name: workspace.name, ownerUid: workspace.ownerUid, role };
      })
    );

    return res.json({ ok: true, workspaces: workspaces.filter(Boolean) });
  } catch (error) {
    console.error("[workspace] list failed:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// Get current user's owned workspace or first active membership
router.get("/current", async (req, res) => {
  try {
    const uid = req.userId || (req.user && req.user.uid);
    const requestedWorkspaceId = String(
      req.get("X-Workspace-Id") || req.query.workspaceId || ""
    ).trim();

    let workspaceDoc = null;
    if (requestedWorkspaceId) {
      workspaceDoc = await db.collection("workspaces").doc(requestedWorkspaceId).get();
    } else {
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
    }

    if (!workspaceDoc || !workspaceDoc.exists) {
      // A signed-in user who has never created or joined a workspace is a
      // normal empty state, not a missing API resource. Keep 404 only for an
      // explicitly requested (usually stale) workspace id so clients can clear it.
      if (requestedWorkspaceId) {
        return res.status(404).json({ ok: false, error: "workspace_not_found" });
      }
      return res.json({
        ok: true,
        empty: true,
        workspace: null,
        membership: null,
        members: [],
        pendingInvites: [],
        permissions: {
          canManageMembers: false,
          canManageBilling: false,
          canEdit: false,
          canPublish: false,
        },
      });
    }

    const workspace = workspaceDoc.data() || {};
    const membershipDoc = await workspaceDoc.ref.collection("members").doc(uid).get();
    const membership =
      workspace.ownerUid === uid
        ? { uid, role: WORKSPACE_ROLES.OWNER, status: "active" }
        : membershipDoc.data();
    if (!membership || membership.status !== "active") {
      return res.status(403).json({ ok: false, error: "not_a_workspace_member" });
    }

    const effectivePlan = await getEffectiveWorkspacePlan(workspace);
    if (
      workspace.seatLimit !== effectivePlan.seatLimit ||
      workspace.planId !== effectivePlan.planId
    ) {
      await workspaceDoc.ref.set(
        {
          seatLimit: effectivePlan.seatLimit,
          planId: effectivePlan.planId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    const membersSnap = await workspaceDoc.ref
      .collection("members")
      .where("status", "==", "active")
      .get();
    const members = membersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const canManage = [WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN].includes(membership.role);
    let pendingInvites = [];
    if (canManage) {
      const inviteSnap = await workspaceDoc.ref
        .collection("invites")
        .where("status", "==", "pending")
        .get();
      pendingInvites = inviteSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(invite => !isInviteExpired(invite))
        .map(({ tokenHash: _tokenHash, ...invite }) => invite);
    }

    return res.json({
      ok: true,
      workspace: {
        ...workspace,
        id: workspaceDoc.id,
        planId: effectivePlan.planId,
        planName: effectivePlan.planName,
        seatLimit: effectivePlan.seatLimit,
        usedSeats: members.length,
        remainingSeats: Math.max(0, effectivePlan.seatLimit - members.length),
        overSeatLimit: members.length > effectivePlan.seatLimit,
      },
      members,
      pendingInvites,
      membership: { uid, role: membership.role, status: membership.status },
      permissions: {
        canManageMembers: canManage,
        canManageBilling: membership.role === WORKSPACE_ROLES.OWNER,
        canEdit: membership.role !== WORKSPACE_ROLES.VIEWER,
        canPublish: membership.role !== WORKSPACE_ROLES.VIEWER,
      },
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

    if (!isValidWorkspaceInviteEmail(email)) {
      return res.status(400).json({ ok: false, error: "valid_email_required" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (
      normalizedEmail ===
      String(req.user?.email || "")
        .trim()
        .toLowerCase()
    ) {
      return res.status(400).json({ ok: false, error: "cannot_invite_yourself" });
    }

    const normalizedRole = [
      WORKSPACE_ROLES.ADMIN,
      WORKSPACE_ROLES.EDITOR,
      WORKSPACE_ROLES.VIEWER,
    ].includes(role)
      ? role
      : WORKSPACE_ROLES.EDITOR;
    if (normalizedRole === WORKSPACE_ROLES.ADMIN && memberRole !== WORKSPACE_ROLES.OWNER) {
      return res.status(403).json({ ok: false, error: "owner_required_for_admin_invite" });
    }

    const workspaceRef = db.collection("workspaces").doc(req.workspaceId);
    const membersSnap = await workspaceRef
      .collection("members")
      .where("status", "==", "active")
      .get();
    const currentSeats = membersSnap.size;
    const effectivePlan = await getEffectiveWorkspacePlan(req.workspace);
    const seatLimit = effectivePlan.seatLimit;

    const existingInviteSnap = await workspaceRef
      .collection("invites")
      .where("email", "==", normalizedEmail)
      .where("status", "==", "pending")
      .limit(1)
      .get();
    if (!existingInviteSnap.empty && !isInviteExpired(existingInviteSnap.docs[0].data())) {
      return res.status(409).json({ ok: false, error: "invite_already_pending" });
    }

    const pendingSnap = await workspaceRef
      .collection("invites")
      .where("status", "==", "pending")
      .get();
    const activePendingCount = pendingSnap.docs.filter(doc => !isInviteExpired(doc.data())).length;

    if (currentSeats + activePendingCount >= seatLimit) {
      return res.status(409).json({
        ok: false,
        error: "seat_limit_reached",
        seatLimit,
        usedSeats: currentSeats,
        pendingSeats: activePendingCount,
      });
    }

    const inviteRef = workspaceRef.collection("invites").doc();
    const inviteToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
    );
    await inviteRef.set({
      id: inviteRef.id,
      email: normalizedEmail,
      role: normalizedRole,
      status: "pending",
      tokenHash: hashInviteToken(inviteToken),
      expiresAt,
      invitedBy: inviterUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const inviteUrl = `${getPublicAppUrl()}/?workspace=${encodeURIComponent(req.workspaceId)}&invite=${encodeURIComponent(inviteRef.id)}&token=${encodeURIComponent(inviteToken)}`;
    let delivery = { ok: false };
    try {
      delivery = await sendWorkspaceInvitation({
        email: normalizedEmail,
        inviterName: req.actorUser?.name || req.user?.name || req.actorUser?.email || "A teammate",
        workspaceName: req.workspace.name || "AutoPromote Workspace",
        role: normalizedRole,
        inviteUrl,
        expiresInDays: INVITE_TTL_DAYS,
      });
    } catch (emailError) {
      console.error("[workspace] invite email failed:", emailError.message);
      delivery = { ok: false, error: "email_delivery_failed" };
    }

    return res.json({
      ok: true,
      inviteId: inviteRef.id,
      inviteUrl,
      expiresAt: expiresAt.toDate().toISOString(),
      emailSent: delivery?.ok === true,
    });
  } catch (error) {
    console.error("[workspace] invite failed:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// Rename a workspace.
router.patch("/:id", requireWorkspaceRole, async (req, res) => {
  try {
    if (![WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN].includes(req.workspaceMembership.role)) {
      return res.status(403).json({ ok: false, error: "insufficient_permissions" });
    }
    const name = String(req.body?.name || "")
      .trim()
      .slice(0, 80);
    if (!name) return res.status(400).json({ ok: false, error: "workspace_name_required" });
    await db.collection("workspaces").doc(req.workspaceId).update({
      name,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.json({ ok: true, name });
  } catch (error) {
    console.error("[workspace] rename failed:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// Leave a workspace without requiring a manager to remove the current member.
router.post("/:id/leave", requireWorkspaceRole, async (req, res) => {
  try {
    const actorUid = req.userId || req.user?.uid;
    if (actorUid === req.workspace.ownerUid) {
      return res.status(400).json({ ok: false, error: "owner_cannot_leave_workspace" });
    }
    const workspaceRef = db.collection("workspaces").doc(req.workspaceId);
    const memberRef = workspaceRef.collection("members").doc(actorUid);
    await db.runTransaction(async tx => {
      const [workspaceDoc, memberDoc] = await Promise.all([
        tx.get(workspaceRef),
        tx.get(memberRef),
      ]);
      if (!workspaceDoc.exists) throw new Error("workspace_not_found");
      if (!memberDoc.exists || memberDoc.data()?.status !== "active") {
        throw new Error("member_not_active");
      }
      tx.update(memberRef, {
        status: "left",
        leftAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.update(workspaceRef, {
        usedSeats: Math.max(1, Number(workspaceDoc.data()?.usedSeats || 1) - 1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    return res.json({ ok: true });
  } catch (error) {
    if (["workspace_not_found", "member_not_active"].includes(error.message)) {
      return res.status(400).json({ ok: false, error: error.message });
    }
    console.error("[workspace] leave failed:", error);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// Accept invite (atomic seat enforcement)
router.post("/:id/invite/:inviteId/accept", async (req, res) => {
  try {
    const uid = req.userId || (req.user && req.user.uid);
    const email = (req.user?.email || "").toLowerCase();
    const { id, inviteId } = req.params;
    const inviteToken = String(req.body?.token || req.query?.token || "");
    if (!inviteToken) {
      return res.status(400).json({ ok: false, error: "invite_token_required" });
    }

    const workspaceRef = db.collection("workspaces").doc(id);
    const inviteRef = workspaceRef.collection("invites").doc(inviteId);
    const memberRef = workspaceRef.collection("members").doc(uid);
    const workspaceSnapshot = await workspaceRef.get();
    if (!workspaceSnapshot.exists) {
      return res.status(400).json({ ok: false, error: "workspace_not_found" });
    }
    const effectivePlan = await getEffectiveWorkspacePlan(workspaceSnapshot.data() || {});

    await db.runTransaction(async tx => {
      const [workspaceDoc, inviteDoc, memberDoc] = await Promise.all([
        tx.get(workspaceRef),
        tx.get(inviteRef),
        tx.get(memberRef),
      ]);

      if (!workspaceDoc.exists) throw new Error("workspace_not_found");
      if (!inviteDoc.exists) throw new Error("invite_not_found");

      const invite = inviteDoc.data() || {};
      const seatLimit = effectivePlan.seatLimit;

      if (invite.status !== "pending") throw new Error("invite_not_pending");
      if (isInviteExpired(invite)) throw new Error("invite_expired");
      const tokenHash = hashInviteToken(inviteToken);
      if (
        !invite.tokenHash ||
        invite.tokenHash.length !== tokenHash.length ||
        !crypto.timingSafeEqual(Buffer.from(invite.tokenHash), Buffer.from(tokenHash))
      ) {
        throw new Error("invite_token_invalid");
      }
      if (invite.email !== email) throw new Error("invite_email_mismatch");
      if (memberDoc.exists && memberDoc.data()?.status === "active")
        throw new Error("already_member");

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
        planId: effectivePlan.planId,
        seatLimit: effectivePlan.seatLimit,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    return res.json({ ok: true });
  } catch (error) {
    const known = [
      "workspace_not_found",
      "invite_not_found",
      "invite_not_pending",
      "invite_expired",
      "invite_token_invalid",
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

// Revoke a pending invitation.
router.delete("/:id/invites/:inviteId", requireWorkspaceRole, async (req, res) => {
  try {
    if (![WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN].includes(req.workspaceMembership.role)) {
      return res.status(403).json({ ok: false, error: "insufficient_permissions" });
    }
    const inviteRef = db
      .collection("workspaces")
      .doc(req.workspaceId)
      .collection("invites")
      .doc(req.params.inviteId);
    const inviteDoc = await inviteRef.get();
    if (!inviteDoc.exists) return res.status(404).json({ ok: false, error: "invite_not_found" });
    if (inviteDoc.data()?.status !== "pending") {
      return res.status(409).json({ ok: false, error: "invite_not_pending" });
    }
    await inviteRef.update({
      status: "revoked",
      revokedBy: req.userId || req.user?.uid,
      revokedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return res.json({ ok: true });
  } catch (error) {
    console.error("[workspace] revoke invite failed:", error);
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
      const [workspaceDoc, memberDoc] = await Promise.all([
        tx.get(workspaceRef),
        tx.get(memberRef),
      ]);
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

    const targetMember = await getWorkspaceMember(req.workspaceId, targetUid);
    if (
      (role === WORKSPACE_ROLES.ADMIN || targetMember?.role === WORKSPACE_ROLES.ADMIN) &&
      actorRole !== WORKSPACE_ROLES.OWNER
    ) {
      return res.status(403).json({ ok: false, error: "owner_required_for_admin_role" });
    }

    const memberRef = db
      .collection("workspaces")
      .doc(req.workspaceId)
      .collection("members")
      .doc(targetUid);
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
