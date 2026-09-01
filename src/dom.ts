export function element<T extends HTMLElement>(
  id: string,
  ctor: new () => T,
): T {
  const node = document.getElementById(id)
  if (!(node instanceof ctor)) {
    throw new Error(`missing #${id}`)
  }
  return node
}
