/**
 * Пересобирает `docs/openapi.json` и типы frontend из него (ARCH-002).
 *
 * Спецификация лежит в репозитории, а не собирается на лету: её читают люди и
 * инструменты, а тест сверяет закоммиченный файл с тем, что даёт код, — поэтому
 * устареть незаметно она не может.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";
import { buildOpenApiDocument } from "../src/contracts/openapi.js";

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(backendRoot, "..");

const specPath = join(repoRoot, "docs", "openapi.json");
const typesPath = join(repoRoot, "frontend", "src", "services", "schema.d.ts");

const document = buildOpenApiDocument();
// Перевод строки в конце — иначе Prettier будет спорить с генератором.
const spec = `${JSON.stringify(document, null, 2)}\n`;

mkdirSync(dirname(specPath), { recursive: true });
writeFileSync(specPath, spec);

const ast = await openapiTS(JSON.parse(spec));
const header = [
  "/**",
  " * Сгенерировано из docs/openapi.json — правки будут затёрты.",
  " *",
  " * Пересобрать: npm --prefix backend run openapi",
  " */",
  "",
].join("\n");
writeFileSync(typesPath, `${header}${astToString(ast)}`);

const paths = Object.keys(document.paths ?? {}).length;
const schemas = Object.keys(document.components?.schemas ?? {}).length;
process.stdout.write(`openapi.json: ${paths} путей, ${schemas} схем\n`);
process.stdout.write(
  `типы frontend: ${readFileSync(typesPath, "utf8").split("\n").length} строк\n`,
);
