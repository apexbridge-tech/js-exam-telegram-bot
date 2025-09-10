import { UserService } from "./user.service.js";
import { SessionService } from "./session.service.js";
import { QuestionService } from "./question.service.js";
import { ReportService } from "./report.service.js";
import { BotService } from "./bot.service.js";
import { AdminStatsService } from "../domain/adminstats/adminStatsService.js";

export interface Services {
  userService: UserService;
  sessionService: SessionService;
  questionService: QuestionService;
  reportService: ReportService;
  botService: BotService;
  adminStatsService: AdminStatsService;
}
