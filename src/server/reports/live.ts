import { ReportService } from "./service";
import { PrismaReportRepository } from "./prisma-reports";

/** Live report service (Prisma). Tests construct `new ReportService(new InMemoryReportRepository())`. */
export function getReportService(): ReportService {
  return new ReportService(new PrismaReportRepository());
}
