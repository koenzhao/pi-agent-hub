export interface AddArgs {
  cwd: string;
  group?: string;
  title?: string;
  initialPrompt?: string;
  additionalCwds: string[];
}

export function parseAddArgs(argv: string[]): AddArgs {
  const cwd = argv[0];
  if (!cwd || cwd.startsWith("-")) throw new Error("Missing cwd");

  let group: string | undefined;
  let title: string | undefined;
  let initialPrompt: string | undefined;
  const additionalCwds: string[] = [];

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const option = optionValue(arg, argv[index + 1]);
    if (!option) throw new Error(`Unknown add argument: ${arg}`);
    if (!option.inline) index += 1;

    switch (option.name) {
      case "-g":
      case "--group":
        group = option.value;
        break;
      case "-t":
      case "--title":
        title = option.value;
        break;
      case "--prompt":
        initialPrompt = option.value;
        break;
      case "--add-cwd":
        if (option.value) additionalCwds.push(option.value);
        break;
      default:
        throw new Error(`Unknown add flag: ${option.name}`);
    }
  }

  if (initialPrompt && /[\r\n]/.test(initialPrompt)) {
    throw new Error("Prompt must be one line; newline characters are not supported");
  }
  return { cwd, group, title, initialPrompt, additionalCwds };
}

function optionValue(arg: string, next: string | undefined): { name: string; value: string; inline: boolean } | undefined {
  if (!arg.startsWith("-")) return undefined;
  const equals = arg.indexOf("=");
  if (equals !== -1) return { name: arg.slice(0, equals), value: arg.slice(equals + 1), inline: true };
  if (next === undefined) throw new Error(`Missing value for ${arg}`);
  return { name: arg, value: next, inline: false };
}
