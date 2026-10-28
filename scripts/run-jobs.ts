import "dotenv/config";
import { runScheduledJobs } from "../src/server/integrations/jobs";

// runScheduledJobs opens one tenant scope per company itself.
runScheduledJobs()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (result.failed > 0) process.exitCode = 1;
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
