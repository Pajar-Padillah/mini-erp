// Printable warehouse task sheets and QR label sheets (opened in a new window).
import QRCode from 'qrcode'
import { fmtDate, fmtDateTime, fmtQty } from './wmsUi'
import {
  TASK_LINE_STATUSES, lineBin, taskDuration, taskStatus, taskStatusLabel, taskTypeLabel, type WarehouseTask,
} from '../../stores/wmsTaskStore'

export const esc = (s: string | number) =>
  String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)

export interface QrLabel { code: string; title: string; sub: string }

const qr = (text: string, width = 240) => QRCode.toDataURL(text, { margin: 0, width, errorCorrectionLevel: 'M' })

/** Open the window synchronously (keeps the pop-up allowed), fill it once the QR images are ready. */
function openPrintWindow(title: string): Window | null {
  const w = window.open('', '_blank', 'width=960,height=760')
  if (w) {
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title></head><body style="font-family:Arial,sans-serif;padding:24px">Preparing…</body></html>`)
  }
  return w
}
function writeAndPrint(w: Window, html: string) {
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 300)
}

export async function printTaskSheet(t: WarehouseTask, skuName: (code: string) => string, skuUnit: (code: string) => string): Promise<boolean> {
  const w = openPrintWindow(`Task ${t.no}`)
  if (!w) return false
  const code = await qr(t.no, 200)
  const rows = t.lines.map((l, i) => `<tr>
    <td>${i + 1}</td><td><b>${esc(l.sku)}</b><div class="muted">${esc(skuName(l.sku))}</div></td>
    <td>${esc(l.batch)}</td><td>${esc(fmtDate(l.exp))}</td>
    <td>${esc(l.fromBin)}</td><td><b>${esc(l.toBin)}</b></td>
    <td class="r">${esc(fmtQty(l.qty))} ${esc(skuUnit(l.sku))}</td><td class="r">${esc(fmtQty(l.done))}</td>
    <td>${esc(TASK_LINE_STATUSES[l.status].label)}</td><td>${esc(l.problem ?? '')}</td><td class="chk"></td></tr>`).join('')
  const logs = t.logs.map((l) => `<tr><td>${esc(fmtDateTime(l.ts))}</td><td>${esc(l.by)}</td><td>${esc(l.action)}</td><td>${esc(l.note ?? '')}</td></tr>`).join('')
  writeAndPrint(w, `<!doctype html><html><head><meta charset="utf-8"><title>Task ${esc(t.no)}</title>
<style>
@page{size:A4 portrait;margin:12mm}
body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;font-size:12px}
h1{font-size:18px;margin:0}.muted{color:#555;font-size:11px}
.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px;gap:16px}
.head img{width:92px;height:92px}
.meta{display:grid;grid-template-columns:130px 1fr 130px 1fr;gap:4px 10px;margin-bottom:14px}
table{width:100%;border-collapse:collapse;margin-bottom:14px}th,td{border:1px solid #999;padding:5px 7px;text-align:left;vertical-align:top}th{background:#eee}.r{text-align:right}
.chk{width:28px}.st{display:inline-block;border:1px solid #111;padding:2px 8px;font-weight:bold;font-size:11px;margin-top:4px}
.sign{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:40px;text-align:center}.sign div{border-top:1px solid #111;padding-top:4px;margin-top:60px}
</style></head><body>
<div class="head"><div><h1>${esc(taskTypeLabel(t.type).toUpperCase())} TASK SHEET</h1><div class="muted">PT Sant Group Indonesia · Warehouse</div>
<div style="font-size:16px;font-weight:bold;margin-top:8px">${esc(t.no)}</div><span class="st">${esc(taskStatusLabel(taskStatus(t)).toUpperCase())}</span></div>
<div style="text-align:center"><img src="${code}" alt="${esc(t.no)}"><div class="muted">Scan to open on mobile</div></div></div>
<div class="meta"><b>Document</b><span>${esc(t.refNo)} – ${esc(t.party)}</span><b>Assigned to</b><span>${esc(t.assignee)}</span>
<b>Created</b><span>${esc(fmtDateTime(t.createdAt))} by ${esc(t.createdBy)}</span><b>Start → finish</b><span>${esc(fmtDateTime(t.startedAt))} → ${esc(fmtDateTime(t.finishedAt))} (${esc(taskDuration(t))})</span>
${t.note ? `<b>Note</b><span style="grid-column:2/5">${esc(t.note)}</span>` : ''}</div>
<table><thead><tr><th>#</th><th>Item</th><th>Batch</th><th>Expiry</th><th>From bin</th><th>To bin</th><th class="r">Planned</th><th class="r">Done</th><th>Status</th><th>Remarks</th><th>✓</th></tr></thead><tbody>${rows}</tbody></table>
<div class="muted" style="margin-bottom:4px"><b>Scan bin ${t.type === 'PUTAWAY' ? '(destination)' : '(source)'}</b>: ${esc(t.lines.map((l) => lineBin(t, l)).filter((b, i, a) => a.indexOf(b) === i).join(', '))}</div>
<div class="muted" style="margin:10px 0 4px"><b>Activity</b></div>
<table><thead><tr><th style="width:150px">Time</th><th style="width:130px">By</th><th>Action</th><th>Note</th></tr></thead><tbody>${logs || '<tr><td colspan="4">-</td></tr>'}</tbody></table>
<div class="sign"><div>Prepared by (Admin)</div><div>Executed by (${esc(t.assignee)})</div><div>Checked by</div></div>
</body></html>`)
  return true
}

export async function printQrLabels(labels: QrLabel[], heading: string): Promise<boolean> {
  const w = openPrintWindow(heading)
  if (!w) return false
  const images = await Promise.all(labels.map((l) => qr(l.code)))
  const cells = labels.map((l, i) => `<div class="lb"><img src="${images[i]}" alt=""><div class="code">${esc(l.title)}</div><div class="sub">${esc(l.sub)}</div><div class="payload">${esc(l.code)}</div></div>`).join('')
  writeAndPrint(w, `<!doctype html><html><head><meta charset="utf-8"><title>${esc(heading)}</title>
<style>
@page{size:A4 portrait;margin:8mm}
body{font-family:Arial,Helvetica,sans-serif;margin:16px;color:#111}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:4mm}
.lb{border:1px dashed #999;border-radius:4px;padding:3mm 2mm;text-align:center;break-inside:avoid;height:46mm;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden}
.lb img{width:24mm;height:24mm}
.code{font-family:monospace;font-weight:bold;font-size:13px;margin-top:2mm}
.sub{font-size:9px;color:#444;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.payload{font-family:monospace;font-size:7px;color:#777;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.top{font-size:11px;color:#555;margin-bottom:4mm}@media print{.top{display:none}}
</style></head><body>
<div class="top">${labels.length} label(s) · ${esc(heading)} · stick on racks / packaging to scan with the phone</div>
<div class="grid">${cells}</div></body></html>`)
  return true
}
