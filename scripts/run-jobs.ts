import "dotenv/config";
import { runScheduledJobs } from "../src/server/integrations/jobs";

runScheduledJobs()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
