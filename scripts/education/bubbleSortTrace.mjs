// Original teaching trace. Array indices are zero-based; equal keys never swap.
export function bubbleSortTrace(input, valueOf = value => value) {
  if (!Array.isArray(input) || input.some(value => !Number.isFinite(valueOf(value)))) throw Error('Use an array of finite numeric keys.');
  const values = [...input], steps = [];
  let comparisons = 0, swaps = 0;
  for (let end = values.length - 1, pass = 1; end > 0; end--, pass++) {
    let changed = false;
    for (let j = 0; j < end; j++) {
      const before = [...values], swap = valueOf(values[j]) > valueOf(values[j + 1]);
      comparisons++;
      if (swap) {
        const temporary = values[j]; values[j] = values[j + 1]; values[j + 1] = temporary;
        swaps++; changed = true;
      }
      steps.push({ pass, end, j, before, left: before[j], right: before[j + 1], swap, after: [...values], comparisons, swaps });
    }
    if (!changed) break;
  }
  return { input: [...input], output: values, steps, comparisons, swaps };
}
