/**
 * Sur mobile, les tableaux `.table-base` s'affichent en cartes empilées (voir index.css) :
 * chaque cellule reçoit en `data-label` le titre de sa colonne.
 */
function labelCells(table: HTMLTableElement) {
  const headers = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent?.trim() ?? '');
  table.querySelectorAll('tbody tr').forEach((row) => {
    let col = 0;
    Array.from((row as HTMLTableRowElement).cells).forEach((cell) => {
      const label = headers[col] ?? '';
      if (cell.dataset.label !== label) cell.dataset.label = label;
      col += cell.colSpan || 1;
    });
  });
}

export function stackTablesOnMobile() {
  const run = () => document.querySelectorAll<HTMLTableElement>('table.table-base').forEach(labelCells);
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      run();
    });
  }).observe(document.body, { childList: true, subtree: true });
  run();
}
