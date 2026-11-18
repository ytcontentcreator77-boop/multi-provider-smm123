import { Fragment, type ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { api, pollDelay } from "../api";
import { ArtTopUpSuccess } from "../art";
import { amount as amountText, balance, num, stars } from "../format";
import { t, type Key } from "../i18n";
import { Icon, StarIcon } from "../icons";
import { refreshMe } from "../me";
import { Confetti, reducedMotion } from "../motion";
import { back, navigate, useRoute } from "../router";
import { meStore } from "../store";
import { haptic, openInvoice } from "../tg";
import { BackNav, BottomButtons, LargeTitle, Num, Presets, Screen, Section, errText, toast } from "../ui";

const PRESETS = [50, 100, 250, 500, 1000, 2500, 5000, 10000];
/** The "Custom" chip: clears the field for any amount within the limits */
const CUSTOM = -1;
/** Pre-selected amount when the route has no `?amount=`. */
const DEFAULT_STARS = 250;

/** Entrance delay for `.rise` (spec §7.8 timeline). */
const at = (ms: number) => `--d:${ms}ms`;

/** t() with nodes (e.g. <Num>) dropped into the sentence, so each language keeps its own word order. */
function tn(key: Key, vars: Record<string, ComponentChildren>): ComponentChildren {
  const marks: Record<string, string> = {};
  for (const k in vars) marks[k] = `\u0001${k}\u0001`;
  return t(key, marks)
    .split("\u0001")
    .map((part, i) => (i % 2 ? <Fragment key={i}>{vars[part]}</Fragment> : part));
}

/** `?amount=` prefill in whole Stars (OrderForm "Add {amount}"), else a default, kept within the top-up limits. */
function prefill(v: string | null, min: number, max: number): string {
  const n = v && /^\d{1,7}$/.test(v) ? Number(v) : DEFAULT_STARS;
  return String(Math.min(Math.max(n, min), max > 0 ? max : n));
}

/** `?ret=` in-app route to go back to after paying; anything that isn't an app path is ignored. */
function safeRet(v: string | null): string | null {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : null;
}

type Done = { added: number; oldBalance: number; paymentId: number; confirmed: boolean };

/** Add funds with Telegram Stars. After paying, the same route shows the success view. */
export function TopUp() {
  const { query } = useRoute();
  const ret = safeRet(query.get("ret"));
  const [done, setDone] = useState<Done | null>(null);
  return (
    <>
      <BackNav to={ret ?? "/wallet"} />
      {done ? <TopUpSuccess {...done} ret={ret} /> : <TopUpForm initial={query.get("amount")} onDone={setDone} backTo={ret ?? "/wallet"} />}
    </>
  );
}

type TopUpMethod = { id: string; name: string; kind: string; gateway?: string; gateway_ready?: boolean; currency: string; details: string; min_amount: number; fee_pct?: number; icon: string | null };
type TopUpCurrency = { code: string; name: string; symbol: string; per_usd: number };

function TopUpForm({ initial, onDone, backTo }: { initial: string | null; onDone: (d: Done) => void; backTo: string }) {
  const me = meStore.use()!;
  const [methods, setMethods] = useState<TopUpMethod[]>([]);
  const [currencies, setCurrencies] = useState<TopUpCurrency[]>([]);
  const [methodId, setMethodId] = useState("stars");
  const [currency, setCurrency] = useState("NPR");
  const [text, setText] = useState(() => prefill(initial, me.minTopup, me.maxTopup));
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    api<{ methods: TopUpMethod[]; currencies: TopUpCurrency[] }>("/wallet/topup-options")
      .then((r) => {
        if (!live) return;
        const available = (r.methods ?? []).filter((m) => m.kind === "stars" || m.kind === "manual" || (m.kind === "api" && m.gateway_ready));
        setMethods(available);
        setCurrencies(r.currencies ?? []);
        const preferred = me.displayCurrency;
        const preferredMethod = available.find((m) => m.kind !== "stars" && m.currency === preferred);
        const localMethod = available.find((m) => m.kind !== "stars" && m.currency === "NPR");
        const defaultCurrency = preferredMethod?.currency ?? localMethod?.currency ?? available.find((m) => m.kind !== "stars")?.currency ?? preferred;
        const firstForCurrency = available.find((m) => m.kind !== "stars" && m.currency === defaultCurrency);
        if (!available.some((m) => m.id === "stars")) setMethodId(firstForCurrency?.id ?? available.find((m) => m.kind !== "stars")?.id ?? available[0]?.id ?? "");
        setCurrency(defaultCurrency);
      })
      .catch(() => live && setLoadError(true))
      .finally(() => live && setOptionsLoading(false));
    return () => { live = false; };
  }, []);

  const method = methods.find((m) => m.id === methodId) ?? null;
  const isStars = method?.kind === "stars";
  const amount = Number(text) || 0;
  const valid = isStars
    ? Number.isInteger(amount) && amount >= me.minTopup && amount <= me.maxTopup
    : !!method && method.kind !== "stars" && method.currency === currency && Number.isFinite(amount) && amount >= method.min_amount && amount <= 1_000_000 && Math.abs(Math.round(amount * 100) - amount * 100) < 1e-6;
  const symbol = currencies.find((c) => c.code === currency)?.symbol ?? currency;

  const pay = async () => {
    if (busy || !method) return;
    if (!valid) {
      haptic.error();
      toast("Enter a valid amount for the selected payment method.", "error");
      input.current?.focus();
      return;
    }
    haptic.press();
    setBusy(true);
    try {
      if (isStars) {
        const oldBalance = me.balance;
        const r = await api<{ invoice: string; stars: number; paymentId: number }>("/wallet/topup", { body: { stars: amount } });
        const status = await openInvoice(r.invoice);
        if (status === "paid") {
          let confirmed = false;
          for (let i = 0; i < 5; i++) {
            const p = await api<{ status: string }>(`/payments/${r.paymentId}`).catch(() => null);
            if (p?.status === "paid") { confirmed = true; break; }
            if (i === 1) toast(t("topup.waiting"));
            await new Promise((res) => setTimeout(res, pollDelay(i)));
          }
          await refreshMe().catch(() => {});
          onDone({ added: amount, oldBalance, paymentId: r.paymentId, confirmed });
          return;
        }
      } else if (method.kind === "manual") {
        const r = await api<{ requestId: number }>("/wallet/topup/manual", { body: { methodId: method.id, currency, amount, reference } });
        toast(`Top-up request #${r.requestId} submitted. Balance will be credited after admin verification.`);
        back(backTo);
        return;
      } else {
        const r = await api<{ requestId: number; checkout: { type: "redirect" | "form"; url?: string; action?: string; fields?: Record<string,string> } }>("/wallet/topup/gateway", { body: { methodId: method.id, currency, amount } });
        if (r.checkout.type === "redirect" && r.checkout.url) {
          window.location.assign(r.checkout.url);
          return;
        }
        if (r.checkout.type === "form" && r.checkout.action && r.checkout.fields) {
          const form = document.createElement("form");
          form.method = "POST"; form.action = r.checkout.action; form.style.display = "none";
          for (const [key, value] of Object.entries(r.checkout.fields)) {
            const field = document.createElement("input"); field.type = "hidden"; field.name = key; field.value = value; form.appendChild(field);
          }
          document.body.appendChild(form); form.submit();
          return;
        }
        throw new Error("Payment checkout could not be opened.");
      }
    } catch (e) {
      toast(errText(e), "error");
    }
    setBusy(false);
  };

  const onAmount = (e: Event) => {
    const el = e.currentTarget as HTMLInputElement;
    const clean = isStars ? el.value.replace(/\D/g, "").slice(0, 7) : el.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").slice(0, 12);
    if (clean !== el.value) el.value = clean;
    setText(clean);
  };

  return (
    <Screen bottom="native" overlay={<BottomButtons main={{ text: busy ? t("common.loading") : isStars ? t("topup.pay", { stars: num(amount > 0 ? amount : me.minTopup) }) : method?.kind === "api" ? "Continue to secure payment" : "Submit top-up request", onClick: pay, progress: busy, shine: true }} secondary={{ text: t("common.back"), onClick: () => back(backTo) }} />}>
      <LargeTitle size="title" title={t("topup.title")} sub={tn("topup.balance", { amount: <Num>{balance(me.balance)}</Num> })} />

      <Section header="Currency">
        {isStars ? (
          <div class="topup-currency-badge"><StarIcon size={18} /> Telegram Stars</div>
        ) : (
          <div class="topup-select-wrap">
            <select class="topup-select" value={currency} onChange={(e) => {
              const next = (e.currentTarget as HTMLSelectElement).value;
              setCurrency(next);
              const nextMethod = methods.find((m) => m.kind !== "stars" && m.currency === next);
              setMethodId(nextMethod?.id ?? (methods.some((m) => m.kind === "stars") ? "stars" : ""));
              setText("");
            }}>
              {currencies.map((c) => <option value={c.code}>{c.name} ({c.code})</option>)}
            </select>
          </div>
        )}
      </Section>

      <Section header="Payment method">
        {loadError ? <p class="topup-hint">Payment methods could not be loaded. Please try again.</p> : null}
        <div class="topup-method-grid">
          {methods.filter((m) => m.kind === "stars" || m.currency === currency).map((m) => (
            <button type="button" class={`topup-method${methodId === m.id ? " selected" : ""}`} onClick={() => { setMethodId(m.id); setText(m.kind === "stars" ? prefill(initial, me.minTopup, me.maxTopup) : ""); }}>
              <span class="topup-method-icon">{m.icon || (m.kind === "stars" ? "⭐" : "💳")}</span>
              <span>{m.name}</span>
              <span class="topup-method-check">{methodId === m.id ? "✓" : ""}</span>
            </button>
          ))}
        </div>
        {optionsLoading ? <p class="topup-hint">Loading payment methods…</p> : null}
        {!methods.length && !loadError && !optionsLoading ? <p class="topup-hint">No payment methods are enabled yet. Please contact the administrator.</p> : null}
      </Section>

      {method?.kind === "manual" && method.details ? (
        <Section header="Payment instructions">
          <div class="card pad topup-instructions">{method.details}</div>
        </Section>
      ) : null}
      {method?.kind === "api" ? <div class="card info"><span class="tile cream"><Icon name="shield" size={18} /></span><span>{method.gateway === "paytm" ? "Paytm's secure checkout shows the payment modes enabled on the merchant account, including UPI when enabled. Your wallet is credited only after Paytm confirms the exact payment." : "You'll complete payment on the provider's secure checkout. Your wallet is credited only after the provider confirms the exact payment."}</span></div> : null}

      <Section labelFor="amt" header={t("topup.amount")} footer={isStars ? tn("topup.limits", { min: <Num>{stars(me.minTopup)}</Num>, max: <Num>{stars(me.maxTopup)}</Num> }) : `Minimum ${symbol}${method?.min_amount ?? 0}`}>
        <div class="card amount-card">
          <div class="row1" dir="ltr">
            <span class="stars-eq" aria-hidden="true">{isStars ? <StarIcon size={26} /> : <b>{symbol}</b>}</span>
            <input ref={input} id="amt" class="num-l" inputMode={isStars ? "numeric" : "decimal"} dir="ltr" autoComplete="off" placeholder={isStars ? num(me.minTopup) : String(method?.min_amount ?? 1)} value={text} onInput={onAmount} />
          </div>
          {isStars ? <Presets value={PRESETS.includes(amount) ? amount : CUSTOM} options={[...PRESETS.filter((p) => p >= me.minTopup && p <= me.maxTopup).map((p): [number, string] => [p, stars(p)]), [CUSTOM, t("topup.custom")]]} label={t("topup.amount")} onChange={(v) => setText(v === CUSTOM ? "" : String(v))} /> : null}
        </div>
      </Section>
      {method?.kind === "api" && (method.fee_pct ?? 0) > 0 && amount > 0 ? <p class="topup-hint">Gateway fee: {(method.fee_pct ?? 0).toFixed(2)}% · Total payable: {symbol}{(amount * (1 + (method.fee_pct ?? 0) / 100)).toFixed(2)}</p> : null}

      {method?.kind === "manual" ? (
        <Section labelFor="payment-reference" header="Transaction reference" footer="Optional, but helps the admin verify your payment faster.">
          <input id="payment-reference" class="topup-reference" value={reference} onInput={(e) => setReference((e.currentTarget as HTMLInputElement).value.slice(0, 160))} placeholder="Transaction ID / reference" />
          <div class="topup-review-note"><Icon name="shield" size={16} /> Your balance is credited only after the payment is verified.</div>
        </Section>
      ) : isStars ? (
        <div class="card info"><span class="tile cream"><StarIcon size={18} /></span><span>{t("topup.note")}</span></div>
      ) : null}
    </Screen>
  );
}

function TopUpSuccess({ added, paymentId, confirmed, ret }: Done & { ret: string | null }) {
  const me = meStore.use()!;
  // The wallet balance is always shown in the customer's selected display currency.
  const shown = balance(me.balance);

  useEffect(() => {
    window.scrollTo(0, 0);
    // The success haptic lands with the coin (spec §7.8).
    const h = setTimeout(() => haptic.success(), 480);
    return () => clearTimeout(h);
  }, []);

  // Telegram said "paid" but the bot hadn't credited the balance yet: keep checking quietly for up to 3 minutes.
  useEffect(() => {
    if (confirmed) return;
    let live = true;
    let tries = 0;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      const p = await api<{ status: string }>(`/payments/${paymentId}`).catch(() => null);
      if (!live) return;
      if (p?.status === "paid") await refreshMe().catch(() => {});
      else if (Date.now() - started < 180_000) timer = setTimeout(check, pollDelay(tries++));
    };
    timer = setTimeout(check, pollDelay(tries++));
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, []);

  // OrderForm already wrote `ret` into its own history entry before opening Top up, so going back lands on the
  // filled form (replacing would leave two identical entries and a Back press that does nothing). Cold start: replace.
  const main = ret
    ? { text: t("topup.backToOrder"), onClick: () => back(ret) }
    : { text: t("common.done"), onClick: () => navigate("/wallet", { replace: true }) };

  return (
    <Screen
      bottom="native"
      center
      overlay={
        <>
          <Confetti n={10} delay={520} />
          <BottomButtons main={main} />
        </>
      }
    >
      <div class="success-art celebrate">
        <ArtTopUpSuccess />
      </div>
      <div class="rise" style={at(240)} role="status">
        <LargeTitle align="center" size="title" title={t("topup.successTitle")} sub={tn("topup.done", { amount: <Num>{amountText(Math.ceil((added * 1_000_000) / me.starsPerUsd), { sign: true })}</Num> })} />
      </div>
      <div class="card pad new-balance rise" style={at(340)}>
        <span>{t("topup.newBalance")}</span>
        <b class="num-xl count" dir="ltr" aria-hidden="true">
          <Num>{shown}</Num>
        </b>
      </div>
    </Screen>
  );
}
