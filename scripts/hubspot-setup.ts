/**
 * Creates the custom properties the receptionist writes (7 of the free plan's 10) and checks the deal stage exists.
 * Safe to re-run. Run: npm run hubspot:setup
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

async function main() {
  const { hs, HubSpotError, CALL_PROPS, CONTACT_PROPS } = await import("../lib/hubspot");
  if (!process.env.HUBSPOT_PRIVATE_APP_TOKEN) throw new Error("Set HUBSPOT_PRIVATE_APP_TOKEN in .env.local first.");

  for (const [object, props] of [["calls", CALL_PROPS], ["contacts", CONTACT_PROPS]] as const) {
    await hs("POST", `/crm/v3/properties/${object}/groups`, { name: "aangan", label: "Aangan AI receptionist" }).catch((e) => {
      if (!(e instanceof HubSpotError && e.status === 409)) throw e;
    });
    for (const [name, p] of Object.entries(props)) {
      const body: Record<string, unknown> = { name, label: p.label, type: p.type, fieldType: p.fieldType, groupName: "aangan" };
      if (p.fieldType === "booleancheckbox") {
        body.options = [
          { label: "Yes", value: "true", displayOrder: 0 },
          { label: "No", value: "false", displayOrder: 1 },
        ];
      }
      try {
        await hs("POST", `/crm/v3/properties/${object}`, body);
        console.log(`created  ${object}.${name}`);
      } catch (e) {
        if (e instanceof HubSpotError && e.status === 409) console.log(`exists   ${object}.${name}`);
        else throw e;
      }
    }
  }

  const pipelines = await hs<{ results: { id: string; label: string; stages: { id: string; label: string }[] }[] }>(
    "GET",
    "/crm/v3/pipelines/deals",
  );
  const pipelineId = process.env.HUBSPOT_PIPELINE_ID || "default";
  const stageId = process.env.HUBSPOT_DEALSTAGE_ID || "appointmentscheduled";
  const pipeline = pipelines.results.find((p) => p.id === pipelineId);
  const stage = pipeline?.stages.find((s) => s.id === stageId);
  if (stage) {
    console.log(`\nDeals go to "${pipeline!.label}" → "${stage.label}". Rename that stage to "Designer meeting booked" in HubSpot if you like.`);
  } else {
    console.log(`\nPipeline/stage ${pipelineId}/${stageId} not found. Available:`);
    for (const p of pipelines.results) console.log(`  ${p.id} (${p.label}): ${p.stages.map((s) => `${s.id}=${s.label}`).join(", ")}`);
    console.log("Set HUBSPOT_PIPELINE_ID / HUBSPOT_DEALSTAGE_ID accordingly.");
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
