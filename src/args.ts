/** Parse text + optional trailing timeout from CLI args.
 *  If last arg is a pure integer and there are 2+ args, it's the timeout.
 *  Everything else is joined as text. */
export function parseTextAndTimeout(args: string[]): { text: string; timeout?: number } {
  if (args.length === 0) return { text: "" };

  const last = args[args.length - 1];
  if (args.length > 1 && /^\d+$/.test(last)) {
    return { text: args.slice(0, -1).join(" "), timeout: parseInt(last, 10) };
  }

  return { text: args.join(" ") };
}

/** Known flags that take a value argument (the next arg after the flag). */
const VALUE_FLAGS = new Set(["section", "around"]);

/** Parse --flag arguments from CLI args.
 *  Known flags are extracted; everything else stays in positional. */
export function parseFlags(
  args: string[],
  known: string[],
): { flags: Record<string, string | boolean>; positional: string[] } {
  const knownSet = new Set(known);
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      if (knownSet.has(name)) {
        // Check if this flag takes a value and the next arg exists and isn't a flag
        if (VALUE_FLAGS.has(name) && i + 1 < args.length && !args[i + 1].startsWith("--")) {
          flags[name] = args[i + 1];
          i += 2;
        } else {
          flags[name] = true;
          i += 1;
        }
      } else {
        positional.push(arg);
        i += 1;
      }
    } else {
      positional.push(arg);
      i += 1;
    }
  }

  return { flags, positional };
}
