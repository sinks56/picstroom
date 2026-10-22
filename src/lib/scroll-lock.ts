/** Reference-counted body scroll lock shared by the viewer and modals. */
let count = 0;

export function lockScroll(): () => void {
  count++;
  if (count === 1) document.documentElement.classList.add('scroll-locked');
  let released = false;
  return () => {
    if (released) return;
    released = true;
    count = Math.max(0, count - 1);
    if (count === 0) document.documentElement.classList.remove('scroll-locked');
  };
}
