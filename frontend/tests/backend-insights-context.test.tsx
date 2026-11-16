import { ALERT_MESSAGES, ALERT_STATUS_LABELS, ALERT_TARGET_LABELS, ALERT_COVERAGE_LABELS, ALERT_DISCLAIMER } from "@/components/alerts/alertMessages";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import BackendInsightsPage from "@/pages/BackendInsightsPage";
import { authSnapshot, checkSession, invalidateAuth, selectSite, type Session } from "@/backend/auth";
import { authResponse, prepareSession, sessionA } from "./backend-auth-fixture";
import fixture from "./fixtures/backend-detail.json";
import type { Recommendation } from "@/backend/p1";

const SITE = sessionA.sites[0].site_id;
const OTHER = "22222222-2222-4222-8222-222222222223";
const EVENT = fixture.event.event_id;
const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const ID_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const path = `/p2/v0.1/recommendations/${ID}/acknowledge`;
const evalPath = `/p2/v0.1/recommendations/evaluate?site_id=${SITE}`;
const permissions = [...sessionA.sites[0].permissions,"alert.read","alert.ack","delivery.read"];
const writer: Session = {...sessionA,sites:[{site_id:SITE,permissions},{site_id:OTHER,permissions}]};
const alert: Recommendation = { recommendation_id:ID,organization_id:fixture.event.organization_id,site_id:SITE,
  target_type:"waste_event",target_ref:EVENT,rule_code:"event_coverage_insufficient",rule_version:"p2-rules-provisional-v0",
  detected_issue:"HISTORICAL <script>alert(1)</script> issue",recommended_action:"ORIGINAL backend action",coverage:"partial",state:"open",
  ack_reason:null,ack_actor:null,ack_at:null,recorded_at:"2026-11-01T00:00:00Z" };
let sessionReply = writer;
let rows: Recommendation[];
let postResult: "saved" | "unknown";
let respond: (url:string,options?:RequestInit)=>Promise<Response>;
let reader: ReturnType<typeof vi.fn>;
function install() {
 reader=vi.fn(async (url:string, options?:RequestInit) => respond(url,options));vi.stubGlobal("fetch",reader);
}
function deferred<T>() { let resolve!:(v:T)=>void;let reject!:(e:Error)=>void;
 const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject}; }
const page = () => <MemoryRouter><BackendInsightsPage /></MemoryRouter>;
function defaultResponse(url:string,options?:RequestInit): Promise<Response> {
 const session=authSnapshot().session ?? sessionReply;
 if(url==="/auth/session")return Promise.resolve(authResponse(sessionReply,200,sessionReply));
 if(url==="/auth/intents")return Promise.resolve(authResponse(options?.method==="POST"?{intent_id:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",state:"registered"}:[],options?.method==="POST"?201:200,session));
 if(url==="/p2/v0.1/recommendations/rules")return Promise.resolve(authResponse([],200,session));
 if(url===evalPath)return postResult==="unknown"?Promise.reject(new TypeError("synthetic lost acknowledgement")):
  Promise.resolve(authResponse({site_id:SITE,rule_version:alert.rule_version,alerts:rows,
   insufficient:[{rule_code:"allocation_exceeds_reference",target_type:"disposition",target_ref:EVENT,state:"insufficient_data",reason:"<b>HISTORICAL reason</b>"}],note:"Backend original note"},200,session));
 if(url===path)return postResult==="unknown"?Promise.reject(new TypeError("synthetic lost acknowledgement")):
  Promise.resolve(authResponse({...alert,state:JSON.parse(String(options?.body)).state,ack_reason:JSON.parse(String(options?.body)).reason,ack_actor:session.principal_id,ack_at:"2026-11-10T00:00:00Z"},200,session));
 if(url.startsWith("/p2/v0.1/recommendations?"))return Promise.resolve(authResponse(rows.filter(r=>r.site_id===new URL(url,"https://127.0.0.1:5173").searchParams.get("site_id")),200,session));
 if(url===`/demo/v0.1/events/${EVENT}`)return Promise.resolve(authResponse(fixture.event,200,session));
 if(url===`/demo/v0.1/events/${EVENT}/measurements`)return Promise.resolve(authResponse([fixture.measurement],200,session));
 return Promise.resolve(authResponse({},404,session));
}
const domainPosts = () => reader.mock.calls.filter(([u,o])=>o?.method==="POST"&&String(u).startsWith("/p2/"));
beforeEach(async()=>{sessionStorage.clear();sessionReply=writer;rows=[alert];postResult="saved";await prepareSession(writer);respond=defaultResponse;install();});
afterEach(()=>{cleanup();invalidateAuth();sessionStorage.clear();});

it("preserves historical backend text literally and explains rule-level coverage without a percentage",async()=>{
 const ui=render(page());await screen.findByText(alert.detected_issue);
 expect(screen.getByText(alert.recommended_action)).toBeVisible();expect(ui.container.querySelector("script")).toBeNull();
 expect(screen.getByText(/Tingkat bukti yang ditetapkan per aturan; bukan persentase kelengkapan/)).toBeVisible();
 expect(screen.getByText("Cakupan pengukuran kejadian belum cukup")).toBeVisible();expect(domainPosts()).toHaveLength(0);
});
it("provides a separate integration seam for reviewed Copilot text without replacing historical strings",async()=>{
 render(<MemoryRouter><BackendInsightsPage explainRule={()=>({label:"SYNTHETIC DICTIONARY LABEL",explanation:"SYNTHETIC EXPLANATION",insufficientData:"SYNTHETIC INSUFFICIENT"})}/></MemoryRouter>);
 expect(await screen.findByText("SYNTHETIC DICTIONARY LABEL")).toBeVisible();
 expect(screen.getByText("SYNTHETIC EXPLANATION")).toBeVisible();expect(screen.getByText(alert.detected_issue)).toBeVisible();
});
it("opens the source with GET only and does not evaluate or acknowledge automatically",async()=>{
 render(page());await userEvent.click(await screen.findByRole("button",{name:"Lihat sumber"}));
 expect(await screen.findByRole("region",{name:"Informasi sumber alert"})).toBeVisible();await screen.findByText(/1 kejadian · 1 observasi/);
 expect(domainPosts()).toHaveLength(0);expect(reader.mock.calls.filter(([,o])=>o?.method==="POST")).toHaveLength(0);
 expect(screen.getByText(alert.recorded_at,{selector:"time"})).toBeVisible();
});
it("focuses the source heading and records the selected alert with the existing contract",async()=>{
 render(page());const user=userEvent.setup();await user.click(await screen.findByRole("button",{name:"Pilih alert ini"}));
 expect(screen.getByRole("heading",{name:"Catatan sumber saat ini"})).toHaveFocus();
 const input=screen.getByLabelText(/Alasan \(wajib/);expect(input).toHaveAttribute("aria-describedby","ack-explanation");
 await user.type(input,"<script>synthetic reason</script>");await user.click(screen.getByRole("button",{name:"Catat tindakan"}));
 await screen.findByText(/Tinjauan tercatat.*alasan tercatat/);
 const posts=domainPosts();expect(posts).toHaveLength(1);expect(posts[0][0]).toBe(path);
 expect(JSON.parse(String(posts[0][1]?.body))).toEqual({state:"acknowledged",reason:"<script>synthetic reason</script>"});
 expect(screen.getByText(/Ini bukan bukti masalah selesai/)).toBeVisible();
 expect(reader.mock.calls.filter(([u,o])=>o?.method==="POST"&&String(u).startsWith("/demo/"))).toHaveLength(0);
});
it.each(["", "   ", "x".repeat(301)])("blocks an invalid reason without registering intent or posting",async reason=>{
 render(page());await userEvent.click(await screen.findByRole("button",{name:"Pilih alert ini"}));
 fireEvent.change(screen.getByLabelText(/Alasan \(wajib/),{target:{value:reason}});fireEvent.submit(screen.getByRole("button",{name:"Catat tindakan"}).closest("form")!);
 expect(screen.getByRole("alert")).toHaveTextContent(/alasan wajib diisi/);expect(domainPosts()).toHaveLength(0);
 expect(reader.mock.calls.filter(([,o])=>o?.method==="POST")).toHaveLength(0);
});
it("explains ephemeral insufficient results without an action or a fabricated number",async()=>{
 const ui=render(page());await screen.findByText(alert.detected_issue);await userEvent.click(screen.getByRole("button",{name:/Evaluasi rekomendasi/}));
 const label=await screen.findByText(/Tidak ada kesimpulan \(insufficient_data\)/);
 const result=label.closest("p")!;expect(within(result).getByText(/Hasil ini tidak disimpan/)).toBeVisible();
 expect(within(result).getByText(/HISTORICAL reason/)).toHaveTextContent("<b>HISTORICAL reason</b>");
 expect(result.querySelector("b")).toBeNull();expect(within(result).queryByRole("button")).not.toBeInTheDocument();
 expect(domainPosts()).toHaveLength(1);ui.unmount();render(page());await screen.findByText(alert.detected_issue);
 expect(screen.queryByText(/Tidak ada kesimpulan \(insufficient_data\)/)).not.toBeInTheDocument();expect(domainPosts()).toHaveLength(1);
});
it("retains UNKNOWN evaluate across remount and never replays after GET",async()=>{
 postResult="unknown";const ui=render(page());await screen.findByText(alert.detected_issue);
 await userEvent.click(screen.getByRole("button",{name:/Evaluasi rekomendasi/}));await screen.findByText(/Hasil evaluasi UNKNOWN/);
 expect(domainPosts()).toHaveLength(1);ui.unmount();render(page());await screen.findByText(alert.detected_issue);
 const button=screen.getByRole("button",{name:/Evaluasi rekomendasi/});expect(button).toBeDisabled();
 await userEvent.click(button);expect(domainPosts()).toHaveLength(1);expect(sessionStorage.getItem(`fwi-p1-pending:${writer.principal_id}:${SITE}:${evalPath}`)).toBe("pending");
});
it("retains UNKNOWN acknowledgement and prevents a second POST, including remount",async()=>{
 postResult="unknown";const ui=render(page());await userEvent.click(await screen.findByRole("button",{name:"Pilih alert ini"}));
 await userEvent.type(screen.getByLabelText(/Alasan \(wajib/),"synthetic check");await userEvent.click(screen.getByRole("button",{name:"Catat tindakan"}));
 await screen.findByText(/Tindakan pada alert ini UNKNOWN/);expect(domainPosts()).toHaveLength(1);
 ui.unmount();render(page());await userEvent.click(await screen.findByRole("button",{name:"Pilih alert ini"}));
 expect(screen.getByRole("button",{name:"Catat tindakan"})).toBeDisabled();await userEvent.click(screen.getByRole("button",{name:"Catat tindakan"}));
 expect(domainPosts()).toHaveLength(1);
});
it("serializes a double submit locally without retry and allows normal definitive success",async()=>{
 const ack=deferred<Response>();respond=(u,o)=>u===path?ack.promise:defaultResponse(u,o);
 render(page());await userEvent.click(await screen.findByRole("button",{name:"Pilih alert ini"}));
 fireEvent.change(screen.getByLabelText(/Alasan \(wajib/),{target:{value:"checked"}});
 const form=screen.getByRole("button",{name:"Catat tindakan"}).closest("form")!;
 fireEvent.submit(form);fireEvent.submit(form);await waitFor(()=>expect(domainPosts()).toHaveLength(1));
 await act(async()=>ack.resolve(authResponse({...alert,state:"acknowledged",ack_reason:"checked",ack_actor:writer.principal_id,ack_at:"2026-11-10T00:00:00Z"},200,writer)));
 await screen.findByText(/Tinjauan tercatat.*alasan tercatat/);expect(sessionStorage.getItem(`fwi-p1-pending:${writer.principal_id}:${SITE}:${path}`)).toBeNull();
});
it("hides writer controls for a Reader while source GET remains available",async()=>{
 await prepareSession({...writer,sites:[{site_id:SITE,permissions:["alert.read","event.read","measurement.read"]}]});install();
 render(page());await screen.findByText(alert.detected_issue);
 expect(screen.queryByRole("button",{name:/Evaluasi rekomendasi|Catat tindakan|Pilih alert ini/})).not.toBeInTheDocument();
 await userEvent.click(screen.getByRole("button",{name:"Lihat sumber"}));await screen.findByText(/1 kejadian · 1 observasi/);expect(domainPosts()).toHaveLength(0);
});
it.each(["resolve","reject"] as const)("ignores stale history %s after site A to B to A",async outcome=>{
 const old=deferred<Response>();let reads=0;respond=(u,o)=>u.startsWith("/p2/v0.1/recommendations?")&&++reads===1?old.promise:defaultResponse(u,o);
 render(page());act(()=>selectSite(OTHER));expect(screen.queryByText(alert.detected_issue)).not.toBeInTheDocument();
 act(()=>selectSite(SITE));await screen.findByText(alert.detected_issue);
 await act(async()=>outcome==="resolve"?old.resolve(authResponse([{...alert,detected_issue:"STALE HISTORY"}],200,writer)):old.reject(new Error("STALE HISTORY ERROR")));
 expect(screen.queryByText(/STALE HISTORY/)).not.toBeInTheDocument();expect(screen.getByText(alert.detected_issue)).toBeVisible();
});
it("does not show a late evaluation after logout/login to a new session",async()=>{
 const old=deferred<Response>();respond=(u,o)=>u===evalPath?old.promise:defaultResponse(u,o);
 render(page());await screen.findByText(alert.detected_issue);await userEvent.click(screen.getByRole("button",{name:/Evaluasi rekomendasi/}));
 await waitFor(()=>expect(domainPosts()).toHaveLength(1));act(()=>invalidateAuth());expect(screen.queryByText(alert.detected_issue)).not.toBeInTheDocument();
 sessionReply={...writer,auth_context_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc"};await act(async()=>checkSession());await screen.findByText(alert.detected_issue);
 await act(async()=>old.resolve(authResponse({site_id:SITE,rule_version:alert.rule_version,alerts:[],insufficient:[],note:"STALE EVALUATION"},200,writer)));
 expect(screen.queryByText("STALE EVALUATION")).not.toBeInTheDocument();expect(screen.getByRole("button",{name:/Evaluasi rekomendasi/})).toBeDisabled();
});
it("keeps unsupported sources explicit and does not expose HELD KPI numbers",async()=>{
 rows=[{...alert,target_type:"meal_service"}];render(page());await screen.findByText(alert.detected_issue);
 expect(screen.getByText(/Tampilan sumber belum tersedia/)).toBeVisible();
 await userEvent.click(screen.getByRole("button",{name:"Lihat sumber"}));expect(screen.getByRole("region")).toHaveTextContent("Tampilan sumber belum tersedia");
 expect(domainPosts()).toHaveLength(0);expect(reader.mock.calls.some(([u])=>String(u).startsWith("/p2/v0.1/kpi/"))).toBe(false);
});

it("changes selected alert A to B to A without accepting the first A source",async()=>{
 rows=[alert,{...alert,recommendation_id:ID_B,target_type:"meal_service"}];
 const old=deferred<Response>();let sourceReads=0;
 respond=(u,o)=>u===`/demo/v0.1/events/${EVENT}`&&++sourceReads===1?old.promise:defaultResponse(u,o);
 render(page());const user=userEvent.setup();const buttons=await screen.findAllByRole("button",{name:"Lihat sumber"});
 await user.click(buttons[0]);await waitFor(()=>expect(sourceReads).toBe(1));
 await user.click(buttons[1]);expect(screen.getByRole("region")).toHaveTextContent("Tampilan sumber belum tersedia");
 await user.click(buttons[0]);await screen.findByText(/1 kejadian · 1 observasi/);
 await act(async()=>old.resolve(authResponse({...fixture.event,recorded_at:"2020-01-01T00:00:00Z"},200,writer)));
 expect(screen.queryByText("2020-01-01T00:00:00Z")).not.toBeInTheDocument();expect(sourceReads).toBe(2);expect(domainPosts()).toHaveLength(0);
});

it("does not treat inherited dictionary property names as supported rules or target labels",async()=>{
 rows=[{...alert,rule_code:"__proto__",target_type:"constructor"}];render(page());await screen.findByText(alert.detected_issue);
 expect(screen.getByText("Penjelasan aturan belum tersedia")).toBeVisible();
 expect(screen.getByText(/Tidak dikenal \(lihat kode asli\)/)).toBeVisible();
 expect(domainPosts()).toHaveLength(0);
});
it("explains an unframed sample without estimating a population or a numeric impact",async()=>{
 rows=[{...alert,rule_code:"sampling_frame_missing",target_type:"meal_service"}];render(page());await screen.findByText(alert.detected_issue);
 expect(screen.getByText(/Sampel tercatat tanpa kerangka populasi/)).toBeVisible();
 expect(screen.getByText(ALERT_DISCLAIMER)).toBeVisible();expect(domainPosts()).toHaveLength(0);
});
it("classifies the static dictionary only for a bounded positive-claim heuristic, with an exact disclaimer allowlist",()=>{
 const neutral=[...Object.values(ALERT_MESSAGES).flatMap(m=>[m.label,m.explanation,m.insufficientData]),
  ...Object.values(ALERT_STATUS_LABELS),...Object.values(ALERT_TARGET_LABELS),...Object.values(ALERT_COVERAGE_LABELS)];
 const unsupportedPositive=/aman (?:untuk )?dikonsumsi|pangan layak dikonsumsi|masalah (?:telah |sudah )?(?:selesai|teratasi|beres)|(?:terbukti|dipastikan) (?:waste|kehilangan)|penghematan (?:Rp|[0-9])|kelengkapan [0-9]+%|(?:rescue|penyaluran) otomatis/i;
 for(const text of neutral){expect(typeof text).toBe("string");expect(text).not.toMatch(unsupportedPositive);}
 const allowedDisclaimers=new Set(["Alert ini tidak membuktikan waste aktual, keamanan pangan, atau bahwa masalah telah selesai."]);
 expect(allowedDisclaimers.has(ALERT_DISCLAIMER)).toBe(true);expect(ALERT_DISCLAIMER).toMatch(/tidak membuktikan/);
 // This is a heuristic over static copy, not semantic proof or a scan of backend/user text.
});
it("keeps a historical backend claim and acknowledgement reason verbatim rather than rewriting evidence",async()=>{
 rows=[{...alert,state:"acknowledged",detected_issue:"Masalah telah selesai — historical backend statement",ack_reason:"<img src=x onerror=alert(1)> original reason"}];
 const ui=render(page());expect(await screen.findByText(rows[0].detected_issue)).toBeVisible();
 expect(screen.getByText(/original reason/)).toHaveTextContent(rows[0].ack_reason!);expect(ui.container.querySelector("img")).toBeNull();
 expect(screen.getByText(ALERT_DISCLAIMER)).toBeVisible();expect(screen.queryByRole("button",{name:"Pilih alert ini"})).not.toBeInTheDocument();
});

it("supports keyboard-only panel focus, return focus and reason editing without POST",async()=>{
 render(page());const user=userEvent.setup();const choose=await screen.findByRole("button",{name:"Pilih alert ini"});
 for(let i=0;i<35&&document.activeElement!==choose;i++)await user.tab();
 expect(choose).toHaveFocus();await user.keyboard("{Enter}");
 expect(screen.getByRole("heading",{name:"Catatan sumber saat ini"})).toHaveFocus();
 await user.tab();expect(screen.getByRole("button",{name:"Tutup panel sumber"})).toHaveFocus();
 await user.keyboard("{Enter}");expect(choose).toHaveFocus();expect(screen.queryByRole("region")).not.toBeInTheDocument();
 const reason=screen.getByLabelText(/Alasan \(wajib/);
 for(let i=0;i<12&&document.activeElement!==reason;i++)await user.tab();
 expect(reason).toHaveFocus();
 await user.keyboard("Catatan sintetis melalui keyboard");expect(reason).toHaveValue("Catatan sintetis melalui keyboard");
 expect(domainPosts()).toHaveLength(0);
});

it.each([["acknowledged","Tinjauan tercatat"],["dismissed","Ditutup oleh petugas"]] as const)("reports %s distinctly in a status region without claiming resolution",async(state,label)=>{
 render(page());const user=userEvent.setup();await user.click(await screen.findByRole("button",{name:"Pilih alert ini"}));
 expect(screen.getByRole("heading",{name:"Catatan sumber saat ini"})).toHaveFocus();
 await user.selectOptions(screen.getByLabelText("Tindakan"),state);
 await user.type(screen.getByLabelText(/Alasan \(wajib/),"Pemeriksaan sintetis");
 await user.click(screen.getByRole("button",{name:"Catat tindakan"}));
 const message=await screen.findByText(new RegExp(`${label} untuk alert`));
 expect(message).toHaveAttribute("role","status");expect(message).toHaveTextContent("Ini bukan bukti masalah selesai");
 expect(JSON.parse(String(domainPosts()[0][1]?.body))).toEqual({state,reason:"Pemeriksaan sintetis"});
});
it("returns focus to the exact source trigger on close without POST or late focus theft",async()=>{
 const old=deferred<Response>();respond=(u,o)=>u===`/demo/v0.1/events/${EVENT}`?old.promise:defaultResponse(u,o);
 render(page());const user=userEvent.setup();const trigger=await screen.findByRole("button",{name:"Lihat sumber"});
 await user.click(trigger);expect(screen.getByRole("heading",{name:"Catatan sumber saat ini"})).toHaveFocus();
 await user.click(screen.getByRole("button",{name:"Tutup panel sumber"}));expect(trigger).toHaveFocus();
 expect(screen.queryByRole("region")).not.toBeInTheDocument();
 await act(async()=>old.resolve(authResponse(fixture.event,200,writer)));
 expect(trigger).toHaveFocus();expect(screen.queryByRole("region")).not.toBeInTheDocument();expect(domainPosts()).toHaveLength(0);
});
it("clears prior evaluation and reason in the same alert-selection transition",async()=>{
 rows=[alert,{...alert,recommendation_id:ID_B,target_type:"meal_service"}];
 render(page());const user=userEvent.setup();expect(await screen.findAllByText(alert.detected_issue)).toHaveLength(2);
 await user.click(screen.getByRole("button",{name:/Evaluasi rekomendasi/}));await screen.findByText(/Tidak ada kesimpulan/);
 const choices=screen.getAllByRole("button",{name:"Pilih alert ini"});await user.click(choices[0]);
 expect(screen.queryByText(/Backend original note/)).not.toBeInTheDocument();expect(screen.queryByText(/Tidak ada kesimpulan/)).not.toBeInTheDocument();
 await user.type(screen.getByLabelText(/Alasan \(wajib/),"OLD A DRAFT");await user.click(choices[1]);
 expect(screen.getByLabelText(/Alasan \(wajib/)).toHaveValue("");expect(screen.getByLabelText("UUID rekomendasi")).toHaveValue(ID_B);
 expect(screen.queryByDisplayValue("OLD A DRAFT")).not.toBeInTheDocument();expect(domainPosts()).toHaveLength(1);
});
it("clears evaluation, selection and draft on site A to B to A before a new result is read",async()=>{
 render(page());const user=userEvent.setup();await user.click(await screen.findByRole("button",{name:"Pilih alert ini"}));
 await user.type(screen.getByLabelText(/Alasan \(wajib/),"PRIVATE A DRAFT");
 await user.click(screen.getByRole("button",{name:/Evaluasi rekomendasi/}));await screen.findByText(/Backend original note/);
 act(()=>selectSite(OTHER));expect(screen.queryByText(/Backend original note/)).not.toBeInTheDocument();
 expect(screen.getByLabelText(/Alasan \(wajib/)).toHaveValue("");expect(screen.queryByRole("region")).not.toBeInTheDocument();
 act(()=>selectSite(SITE));expect(screen.getByLabelText("UUID rekomendasi")).toHaveValue("");expect(screen.getByLabelText(/Alasan \(wajib/)).toHaveValue("");
 expect(screen.queryByText(/Backend original note/)).not.toBeInTheDocument();await screen.findByText(alert.detected_issue);
});
it("does zero additional network calls for a pre-existing pending acknowledgement marker",async()=>{
 sessionStorage.setItem(`fwi-p1-pending:${writer.principal_id}:${SITE}:${path}`,"pending");
 render(page());const user=userEvent.setup();await user.click(await screen.findByRole("button",{name:"Pilih alert ini"}));await screen.findByText(/1 kejadian · 1 observasi/);
 const calls=reader.mock.calls.length;const button=screen.getByRole("button",{name:"Catat tindakan"});expect(button).toBeDisabled();
 await user.click(button);fireEvent.submit(button.closest("form")!);
 expect(reader.mock.calls).toHaveLength(calls);expect(domainPosts()).toHaveLength(0);
 expect(screen.getAllByText(/belum terkonfirmasi; jangan kirim ulang/i).length).toBeGreaterThan(0);
});
it("shows the three v0.3 timestamp labels and exact no-snapshot warning without changing alert state",async()=>{
 render(page());await userEvent.click(await screen.findByRole("button",{name:"Lihat sumber"}));await screen.findByText(/1 kejadian · 1 observasi/);
 const region=screen.getByRole("region");
 for(const label of ["Waktu pengukuran dicatat","Waktu pengukuran dilakukan"])expect(within(region).getByText(label)).toBeVisible();
 expect(within(region).getByText(/Waktu evaluasi yang mencatat alert/)).toBeVisible();
 expect(within(region).getByText("Urutan waktu pencatatan bukan bukti bahwa kondisi sumber berubah atau bahwa alert tidak berlaku. Sistem tidak menyimpan salinan kondisi sumber saat alert dibuat.")).toBeVisible();
 expect(within(region).getAllByText(/zona waktu: UTC \(Z\)/).length).toBeGreaterThan(0);
 expect(within(region).getAllByText(/zona waktu: \+08:00/).length).toBeGreaterThan(0);
 expect(screen.getByText(/Status tersimpan:/)).toHaveTextContent("Terbuka");expect(domainPosts()).toHaveLength(0);
 expect(screen.getByText("Teks tercatat sistem (asli, tidak diterjemahkan)")).toBeVisible();
});

it("returns focus to the same alert source control when the open-only selection button disappears",async()=>{
 respond=(u,o)=>{
  if(u===path){rows=[{...alert,state:"acknowledged",ack_reason:"checked",ack_actor:writer.principal_id,ack_at:"2026-11-10T00:00:00Z"}];return Promise.resolve(authResponse(rows[0],200,writer));}
  return defaultResponse(u,o);
 };
 render(page());const user=userEvent.setup();await user.click(await screen.findByRole("button",{name:"Pilih alert ini"}));
 await user.type(screen.getByLabelText(/Alasan \(wajib/),"checked");await user.click(screen.getByRole("button",{name:"Catat tindakan"}));
 await screen.findByText(/Tinjauan tercatat untuk alert/);await waitFor(()=>expect(screen.queryByRole("button",{name:"Pilih alert ini"})).not.toBeInTheDocument());
 await user.click(screen.getByRole("button",{name:"Tutup panel sumber"}));expect(screen.getByRole("button",{name:"Lihat sumber"})).toHaveFocus();
});
