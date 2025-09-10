import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  BOT_TOKEN: z.string().min(10, "BOT_TOKEN is required"),
  DB_FILE: z.string().default("./data/jsa.sqlite"),
  TZ: z.string().optional(),
  NODE_ENV: z.string().optional(),
  QUESTIONS_FILE: z.string().default("./data/questions.json"),
});

export const config = Env.parse(process.env);
