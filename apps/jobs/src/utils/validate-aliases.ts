import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export function validateAliasFile(filePath: string): Record<string, string> {
  const text = fs.readFileSync(filePath, "utf8");
  const doc = yaml.load(text) as Record<string, string>;
  const seen = new Set<string>();
  const dups: string[] = [];

  for (const k of Object.keys(doc)) {
    if (seen.has(k)) dups.push(k);
    seen.add(k);
  }
  
  if (dups.length) {
    throw new Error(
      `Duplicate keys in ${path.basename(filePath)}: ${dups.join(", ")}`
    );
  }
  
  return doc;
}
