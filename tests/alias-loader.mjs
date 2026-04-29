import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const targetPath = specifier.endsWith(".js") ? specifier.slice(2) : `${specifier.slice(2)}.js`;
    const absolutePath = path.join(projectRoot, targetPath);
    return nextResolve(pathToFileURL(absolutePath).href, context);
  }

  return nextResolve(specifier, context);
}
