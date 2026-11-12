export async function fillTimestamp(page, label, value) {
 const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:\d{2})$/.exec(value);
 if (!match) throw new Error('Test timestamp must have explicit source offset');
 if (match[2].includes('.')) {
  const raw=page.getByLabel(label+' ISO-8601 dengan offset',{exact:true});
  const details=raw.locator('xpath=ancestor::details[1]');if(!(await details.evaluate(d=>d.open)))await details.locator('summary').click();
  await raw.fill(value);
 } else {
  await page.getByLabel(label+': tanggal',{exact:true}).fill(match[1]);
  await page.getByLabel(label+': jam',{exact:true}).fill(match[2]);
  await page.getByLabel(label+': offset',{exact:true}).fill(match[3]);
 }
}
export async function openSourceDetails(page) {
 const details=page.locator('details').filter({has:page.getByText('Instrumen, sampel & nilai sumber tambahan',{exact:true})});
 if(!(await details.evaluate(d=>d.open)))await details.locator('summary').click();
}
