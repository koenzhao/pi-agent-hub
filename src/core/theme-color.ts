export function colorFromAnsi(value: string): string | number | undefined {
  if (/\u001b\[(?:39|49)m/.test(value)) return "";
  const truecolor = /\u001b\[(?:38|48);2;(\d+);(\d+);(\d+)m/.exec(value);
  if (truecolor) {
    const rgb = truecolor.slice(1, 4).map(Number);
    if (rgb.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
      return `#${rgb.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
    }
  }
  const indexed = /\u001b\[(?:38|48);5;(\d+)m/.exec(value);
  if (indexed) {
    const number = Number(indexed[1]);
    if (Number.isInteger(number) && number >= 0 && number <= 255) return number;
  }
  return undefined;
}
