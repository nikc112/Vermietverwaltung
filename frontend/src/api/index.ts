import client from './client';
import type { AxiosProgressEvent } from 'axios';
import type {
  Eigentuemer, Mietobjekt, Mieteinheit, Mieter, Mietvertrag,
  Mietzahlung, Kosten, KategorieMeta, NebenkostenAbrechnung,
  DashboardKennzahlen, Benutzer, Kontakt, KontaktPayload, Loeschpruefung,
  KontaktForderungen, Mahnung, Frist, FristPayload, FristStatus, FristTyp,
  Dokument, DokumentFilter, DokumentUpdate,
} from '../types';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const api = {
  auth: {
    login: (email: string, password: string) =>
      client.post<{ token: string; benutzer: { id: number; email: string; name: string; rolle: string } }>('/auth/login', { email, password }),
    me: () => client.get('/auth/me'),
    changePassword: (altesPasswort: string, neuesPasswort: string) =>
      client.put('/auth/passwort', { altesPasswort, neuesPasswort }),
  },

  // ─── Eigentuemer ──────────────────────────────────────────────────────────
  eigentuemer: {
    list: (params?: { aktiv?: boolean }) =>
      client.get<Eigentuemer[]>('/eigentuemer', { params }),
    get: (id: number) => client.get<Eigentuemer>(`/eigentuemer/${id}`),
    create: (data: Partial<Eigentuemer>) => client.post<Eigentuemer>('/eigentuemer', data),
    update: (id: number, data: Partial<Eigentuemer>) =>
      client.put<Eigentuemer>(`/eigentuemer/${id}`, data),
    delete: (id: number) => client.delete(`/eigentuemer/${id}`),
  },

  // ─── Mietobjekte ──────────────────────────────────────────────────────────
  mietobjekte: {
    list: (params?: { eigentuemerID?: number; typ?: string; aktiv?: boolean }) =>
      client.get<Mietobjekt[]>('/mietobjekte', { params }),
    get: (id: number) => client.get<Mietobjekt>(`/mietobjekte/${id}`),
    create: (data: Partial<Mietobjekt>) => client.post<Mietobjekt>('/mietobjekte', data),
    update: (id: number, data: Partial<Mietobjekt>) =>
      client.put<Mietobjekt>(`/mietobjekte/${id}`, data),
    delete: (id: number) => client.delete(`/mietobjekte/${id}`),
    einheiten: (id: number) => client.get<Mieteinheit[]>(`/mietobjekte/${id}/einheiten`),
    kosten: (id: number, params?: { jahr?: number }) =>
      client.get<Kosten[]>(`/mietobjekte/${id}/kosten`, { params }),
    kostenZusammenfassung: (id: number, jahr: number) =>
      client.get(`/mietobjekte/${id}/kosten/zusammenfassung`, { params: { jahr } }),
  },

  // ─── Mieteinheiten ────────────────────────────────────────────────────────
  mieteinheiten: {
    list: (params?: { mietobjektID?: number; aktiv?: boolean }) =>
      client.get<Mieteinheit[]>('/mieteinheiten', { params }),
    get: (id: number) => client.get<Mieteinheit>(`/mieteinheiten/${id}`),
    create: (data: Partial<Mieteinheit> & { mietobjektID: number }) =>
      client.post<Mieteinheit>('/mieteinheiten', data),
    update: (id: number, data: Partial<Mieteinheit>) =>
      client.put<Mieteinheit>(`/mieteinheiten/${id}`, data),
    delete: (id: number) => client.delete(`/mieteinheiten/${id}`),
  },

  // ─── Mieter ───────────────────────────────────────────────────────────────
  mieter: {
    list: (params?: { search?: string }) =>
      client.get<Mieter[]>('/mieter', { params }),
    get: (id: number) => client.get<Mieter>(`/mieter/${id}`),
    create: (data: Partial<Mieter>) => client.post<Mieter>('/mieter', data),
    update: (id: number, data: Partial<Mieter>) =>
      client.put<Mieter>(`/mieter/${id}`, data),
  },

  // ─── Kontakte ──────────────────────────────────────────────────────────────
  kontakte: {
    list: (params?: { suche?: string; rolle?: string; inaktive?: boolean }) =>
      client.get<Kontakt[]>('/kontakte', { params }),
    get: (id: number) => client.get<Kontakt>(`/kontakte/${id}`),
    create: (data: KontaktPayload) => client.post<Kontakt>('/kontakte', data),
    update: (id: number, data: KontaktPayload) => client.put<Kontakt>(`/kontakte/${id}`, data),
    delete: (id: number) => client.delete<Loeschpruefung>(`/kontakte/${id}`),
    loeschpruefung: (id: number) => client.get<Loeschpruefung>(`/kontakte/${id}/loeschpruefung`),
    dsgvoExport: (id: number) =>
      client.get<Blob>(`/kontakte/${id}/dsgvo-export`, { responseType: 'blob' }),
  },

  // ─── Mietvertraege ────────────────────────────────────────────────────────
  mietvertraege: {
    list: (params?: { status?: string; mieteinheitID?: number; mieterID?: number }) =>
      client.get<Mietvertrag[]>('/mietvertraege', { params }),
    get: (id: number) => client.get<Mietvertrag>(`/mietvertraege/${id}`),
    create: (data: Partial<Mietvertrag>) => client.post<Mietvertrag>('/mietvertraege', data),
    update: (id: number, data: Partial<Mietvertrag>) =>
      client.put<Mietvertrag>(`/mietvertraege/${id}`, data),
    kuendigen: (id: number, kuendigungsdatum: string) =>
      client.post(`/mietvertraege/${id}/kuendigen`, { kuendigungsdatum }),
  },

  // ─── Kosten ───────────────────────────────────────────────────────────────
  kosten: {
    list: (params?: { mietobjektID?: number; jahr?: number; kategorie?: string; umlagefaehig?: boolean }) =>
      client.get<Kosten[]>('/kosten', { params }),
    get: (id: number) => client.get<Kosten>(`/kosten/${id}`),
    create: (data: Partial<Kosten> & { mietobjektID: number; umlageEinheitenIDs?: number[] }) =>
      client.post<Kosten>('/kosten', data),
    update: (id: number, data: Partial<Kosten> & { umlageEinheitenIDs?: number[] }) =>
      client.put<Kosten>(`/kosten/${id}`, data),
    delete: (id: number) => client.delete(`/kosten/${id}`),
    kategorien: () => client.get<KategorieMeta[]>('/kosten/kategorien'),
  },

  // ─── Mietzahlungen ────────────────────────────────────────────────────────
  mietzahlungen: {
    list: (params?: { mietvertragID?: number; jahr?: number; eingegangen?: boolean }) =>
      client.get<Mietzahlung[]>('/mietzahlungen', { params }),
    ausstehend: () => client.get<Mietzahlung[]>('/mietzahlungen/ausstehend'),
    get: (id: number) => client.get<Mietzahlung>(`/mietzahlungen/${id}`),
    create: (data: Partial<Mietzahlung>) => client.post<Mietzahlung>('/mietzahlungen', data),
    update: (id: number, data: Partial<Mietzahlung>) =>
      client.put<Mietzahlung>(`/mietzahlungen/${id}`, data),
    bulkAnlegen: (mietvertragID: number, jahr: number) =>
      client.post('/mietzahlungen/bulk-anlegen', { mietvertragID, jahr }),
  },

  // ─── Forderungen ──────────────────────────────────────────────────────────
  forderungen: {
    list: () => client.get<KontaktForderungen[]>('/forderungen'),
    kontakt: (id: number) => client.get<KontaktForderungen>(`/forderungen/kontakt/${id}`),
  },

  // ─── Mahnungen ────────────────────────────────────────────────────────────
  mahnungen: {
    list: (params?: { kontaktID?: number }) => client.get<Mahnung[]>('/mahnungen', { params }),
    create: (kontaktID: number) => client.post<Mahnung>('/mahnungen', { kontaktID }),
    pdf: (id: number) => client.get<Blob>(`/mahnungen/${id}/pdf`, { responseType: 'blob' }),
    versenden: (id: number) => client.post(`/mahnungen/${id}/versenden`),
    gebuehrBeglichen: (id: number, beglichen: boolean) =>
      client.put<Mahnung>(`/mahnungen/${id}/gebuehr-beglichen`, { beglichen }),
    delete: (id: number) => client.delete(`/mahnungen/${id}`),
  },

  // ─── Fristen ──────────────────────────────────────────────────────────────
  fristen: {
    list: (status?: FristStatus) =>
      client.get<Frist[]>('/fristen', { params: status ? { status } : undefined }),
    create: (data: FristPayload) => client.post<Frist>('/fristen', data),
    update: (id: number, data: Partial<FristPayload> & { status?: FristStatus; notizen?: string | null }) =>
      client.put<Frist>(`/fristen/${id}`, data),
    overrideAuto: (
      typ: Exclude<FristTyp, 'MANUELL'>,
      vertragID: number,
      data: { referenzJahr?: number; faelligAm?: string; status?: FristStatus; notizen?: string | null },
    ) => client.put<Frist>(`/fristen/auto/${typ}/${vertragID}`, data),
    delete: (id: number) => client.delete(`/fristen/${id}`),
  },

  // ─── Dokumente ────────────────────────────────────────────────────────────
  dokumente: {
    list: (params?: DokumentFilter) => client.get<Dokument[]>('/dokumente', { params }),
    get: (id: number) => client.get<Dokument>(`/dokumente/${id}`),
    download: (id: number) => client.get<Blob>(`/dokumente/${id}/download`, { responseType: 'blob' }),
    upload: (formData: FormData, onUploadProgress?: (event: AxiosProgressEvent) => void) =>
      client.post<{ dokument: Dokument; dublette: number | null }>('/dokumente', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress,
      }),
    update: (id: number, data: DokumentUpdate) =>
      client.put<Dokument>(`/dokumente/${id}`, data),
    delete: (id: number) => client.delete(`/dokumente/${id}`),
    schlagworte: () => client.get<string[]>('/dokumente/schlagworte'),
    textNeu: (id: number) => client.post<{ message: string }>(`/dokumente/${id}/text-neu`),
  },

  // ─── Nebenkosten ──────────────────────────────────────────────────────────
  nebenkosten: {
    vorschau: (mietvertragID: number, abrechnungsjahr: number, abrechnungStart?: string, abrechnungEnde?: string) =>
      client.post('/nebenkosten/vorschau', { mietvertragID, abrechnungsjahr, abrechnungStart, abrechnungEnde }),
    list: (params?: { mietvertragID?: number }) =>
      client.get<NebenkostenAbrechnung[]>('/nebenkosten/abrechnungen', { params }),
    get: (id: number) =>
      client.get<NebenkostenAbrechnung>(`/nebenkosten/abrechnungen/${id}`),
    create: (mietvertragID: number, abrechnungsjahr: number, notizen?: string, abrechnungStart?: string, abrechnungEnde?: string) =>
      client.post<NebenkostenAbrechnung>('/nebenkosten/abrechnungen', {
        mietvertragID,
        abrechnungsjahr,
        notizen,
        abrechnungStart,
        abrechnungEnde,
      }),
    delete: (id: number) => client.delete(`/nebenkosten/abrechnungen/${id}`),
    bulkErstellen: (abrechnungsjahr: number, abrechnungStart?: string, abrechnungEnde?: string) =>
      client.post<{
        erstellt: { mieterName: string; einheit: string }[];
        uebersprungen: { mieterName: string; einheit: string }[];
        fehler: { mieterName: string; einheit: string; fehler: string }[];
      }>('/nebenkosten/abrechnungen/bulk', { abrechnungsjahr, abrechnungStart, abrechnungEnde }),
    downloadPdf: (id: number) =>
      client.get(`/nebenkosten/abrechnungen/${id}/pdf`, { responseType: 'blob' }),
    senden: (id: number, empfaengerEmail?: string) =>
      client.post(`/nebenkosten/abrechnungen/${id}/senden`, { empfaengerEmail }),
    nachzahlungBeglichen: (id: number, beglichen: boolean) =>
      client.put(`/nebenkosten/abrechnungen/${id}/nachzahlung-beglichen`, { beglichen }),
  },

  // ─── Dashboard ────────────────────────────────────────────────────────────
  dashboard: {
    kennzahlen: () => client.get<DashboardKennzahlen>('/dashboard/kennzahlen'),
    offeneZahlungen: () => client.get<Mietzahlung[]>('/dashboard/offene-zahlungen'),
    teilzahlungen: () => client.get<Mietzahlung[]>('/dashboard/teilzahlungen'),
    auslaufendeVertraege: () => client.get<Mietvertrag[]>('/dashboard/auslaufende-vertraege'),
  },

  // ─── Benutzerverwaltung ───────────────────────────────────────────────────
  benutzer: {
    list: () => client.get<Benutzer[]>('/benutzer'),
    create: (data: { email: string; name: string; password: string; rolle: string; aktiv: boolean }) =>
      client.post<Benutzer>('/benutzer', data),
    update: (id: number, data: { name?: string; email?: string; rolle?: string; aktiv?: boolean }) =>
      client.put<Benutzer>(`/benutzer/${id}`, data),
    resetPasswort: (id: number, neuesPasswort: string) =>
      client.put(`/benutzer/${id}/passwort`, { neuesPasswort }),
    deactivate: (id: number) => client.delete(`/benutzer/${id}`),
  },

  // ─── Einstellungen ────────────────────────────────────────────────────────
  einstellungen: {
    get: () => client.get<Record<string, string>>('/einstellungen'),
    update: (data: Record<string, string>) => client.put('/einstellungen', data),
  },
};
