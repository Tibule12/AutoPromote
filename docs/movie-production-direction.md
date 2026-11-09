# AutoPromote movie direction

AutoPromote should turn a screenplay into a finished film. Users should not
need to record multicamera coverage before the system can begin. The product's
creative test is whether a viewer follows the story, reaches a worthwhile
payoff and wants to understand how the work was made.

The backend foundation is private during qualification:

1. Preserve the uploaded screenplay, its source hash and exact scene/dialogue
   references. Identify characters, locations and script-grounded props.
2. Define the dramatic question and eleven story decisions per scene. Derive
   motivated shots and deliberate omissions, rather than a feature showcase.
3. Maintain intended identity, wardrobe, prop, location, lighting and spatial
   continuity in a reusable production bible. Distinguish script facts from
   creative choices and intended requirements from observed generated pixels.
4. Generate separate picture, character/reference, dialogue, ambience, sound,
   music, 3D and VFX assets. Retain model/revision, settings, seeds, script/brief,
   parent references, artifact hashes, review evidence and reusable sources.
5. Reject or regenerate weak assets. Verify identities, physical action,
   dialogue coverage/alignment and continuity against actual generated media.
6. Assemble accepted shots and scenes through AutoPromote's existing Director,
   project intelligence, canonical document/compiler and render contracts.
7. Review the whole film for story, pacing, sound, continuity and payoff. A
   technically valid encode is insufficient; preserve rejected versions and
   require changed creative decisions before another render.

Implemented import/planning, private scene-job and assembly contracts are
documented in [content-factory.md](content-factory.md#script-to-film-foundations).
The current executable scene profile does not qualify character-reference
generation or spoken dialogue alignment. Neither plan validation nor mocked
provider tests establish that full screenplay-to-film works. Those stages need
real generated media and independent review before any public claim.

Written plans also require creative inspection. Source-valid quotes do not
prove compelling direction or correct prop coreference. The private service
records a plan-hash-bound creative rejection and prevents scene generation,
inherited later planning and final assembly from using it. The ordinary Factory
worker rechecks the parent plan before inference and rendering, including for
an already queued scene. Rejected plans and their provenance remain available.
Full plan-version rollback, prop alias resolution and automatic creative
replanning still require qualification; begin a corrected production request
rather than overwrite a rejected production bible.

AutoPromote's own marketing should use this same path. Its output should earn
attention through the work itself; the film must not advertise stages that are
still blocked. Welcome films, social cuts and reusable brand idents remain
private founder review until their actual creative and product claims pass.
