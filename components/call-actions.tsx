"use client";

import { useEffect, useRef, useState } from "react";
import { callBrief, contactLink, introMessage } from "@/lib/call-brief";
import type { CallListEntry } from "@/lib/types";

export function CopyBrief({ fund, entries }: { fund: string; entries: CallListEntry[] }) {
  const [status, setStatus] = useState("Copy call brief");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return <button className="px-btn px-primary" disabled={!entries.length} onClick={async () => {
    try { await navigator.clipboard.writeText(callBrief(fund, entries)); setStatus("Copied"); }
    catch { setStatus("Copy failed — try again"); }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("Copy call brief"), 2500);
  }}>{status}</button>;
}

export function ContactLink({ entry }: { entry: CallListEntry }) {
  return <a className="px-btn" href={contactLink(entry)} target="_blank" rel="noopener noreferrer">
    {entry.founder.linkedinUrl ? "LinkedIn" : "Search LinkedIn"}
  </a>;
}

/** Copies a ready-to-send intro and opens the contact's LinkedIn, so the founder only has to paste and send. */
export function DraftIntro({ fund, entry }: { fund: string; entry: CallListEntry }) {
  const [status, setStatus] = useState("Draft intro");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const message = introMessage(fund, entry);
  return <button className="px-btn" title={message} onClick={async () => {
    try { await navigator.clipboard.writeText(message); setStatus("Intro copied · paste it on LinkedIn"); }
    catch { setStatus("Copy failed — try again"); }
    window.open(contactLink(entry), "_blank", "noopener,noreferrer");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("Draft intro"), 4000);
  }}>{status}</button>;
}
