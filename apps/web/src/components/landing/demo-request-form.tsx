"use client";

import { CheckCircle2, Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";

/**
 * Demo talep formu — strateji dokümanındaki "Demo / İletişim" sayfasının
 * dönüşüm formu. Henüz bir CRM/backend ucu olmadığından gönderim, kullanıcının
 * e-posta istemcisinde önceden doldurulmuş bir mesaj açar (mailto). Gerçek
 * form backend'i/CRM entegrasyonu devreye alındığında yalnızca submit
 * davranışı değişir; alanlar aynı kalır.
 */
export function DemoRequestForm({ contactEmail }: { contactEmail: string }) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [facilities, setFacilities] = useState("1");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const t = useT();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const subject = `${t.landing.demoForm.subject} — ${company || name}`;
    const body = [
      `${t.landing.demoForm.name}: ${name}`,
      `${t.landing.demoForm.company}: ${company}`,
      `${t.landing.demoForm.email}: ${email}`,
      phone ? `${t.landing.demoForm.phone}: ${phone}` : null,
      t.landing.demoForm.bodyFacilities(facilities),
      "",
      message ? `Not: ${message}` : null,
      "",
      "— logislot.com demo formu",
    ]
      .filter((line) => line !== null)
      .join("\n");
    window.location.href = `mailto:${contactEmail}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-status-approved/30 bg-status-approved/5 p-8 text-center dark:bg-status-approved/10">
        <CheckCircle2 className="h-10 w-10 text-status-approved" />
        <h3 className="text-lg font-bold">{t.landing.demoForm.sentTitle}</h3>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          {t.landing.demoForm.sentLead}{" "}
          <a
            href={`mailto:${contactEmail}`}
            className="font-medium text-foreground underline decoration-border underline-offset-2"
          >
            {contactEmail}
          </a>
          {t.landing.demoForm.sentTail}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="demo-name">{t.landing.demoForm.name}</Label>
          <Input
            id="demo-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder={t.landing.demoForm.namePlaceholder}
            className="h-12"
          />
        </div>
        <div>
          <Label htmlFor="demo-company">{t.landing.demoForm.company}</Label>
          <Input
            id="demo-company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            required
            placeholder={t.landing.demoForm.companyPlaceholder}
            className="h-12"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="demo-email">{t.landing.demoForm.emailCorporate}</Label>
          <Input
            id="demo-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder={t.landing.demoForm.emailPlaceholder}
            className="h-12"
          />
        </div>
        <div>
          <Label htmlFor="demo-phone">{t.landing.demoForm.phoneOptional}</Label>
          <Input
            id="demo-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+90 ..."
            className="h-12"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="demo-facilities">{t.landing.demoForm.facilities}</Label>
        <Select
          id="demo-facilities"
          value={facilities}
          onChange={(e) => setFacilities(e.target.value)}
          className="h-12"
        >
          <option value="1">{t.landing.demoForm.facilityOptions.one}</option>
          <option value="2-5">{t.landing.demoForm.facilityOptions.few}</option>
          <option value="6+">{t.landing.demoForm.facilityOptions.many}</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="demo-message">{t.landing.demoForm.message}</Label>
        <textarea
          id="demo-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder={t.landing.demoForm.messagePlaceholder}
          className="w-full rounded-lg border border-border bg-card p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        />
      </div>
      <Button type="submit" size="lg" className="mt-1 w-full">
        <Send className="h-4 w-4" />
        {t.landing.demoForm.submit}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        {t.landing.demoForm.noteLead}{" "}
        <strong>{t.landing.demoForm.noteHighlight}</strong>
        {t.landing.demoForm.noteTail}
      </p>
    </form>
  );
}
