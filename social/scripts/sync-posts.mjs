// Copies the shared post-drawing code from the Salonicup "Posts" tab into the agent.
// Run after any change in app/admin/post/canvas.ts or build.ts:  npm run sync:posts
import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
for (const f of ["canvas.ts", "build.ts"]) {
  copyFileSync(here(`../../app/admin/post/${f}`), here(`../lib/posts/${f}`));
  console.log(`synced ${f}`);
}
