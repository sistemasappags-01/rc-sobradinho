// ═══════════════════════════════════════════════════════════
//  config.js — Credenciais e configurações globais
// ═══════════════════════════════════════════════════════════

const CONFIG = {
  SUPABASE_URL: 'https://kosiqdzgyutdsexclzvk.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtvc2lxZHpneXV0ZHNleGNsenZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MjQyMTIsImV4cCI6MjA5MzAwMDIxMn0.Aq4ZExIo8O82eB0B2-t8Nh-NyBfCm3sb1vRhutlLOFo',
  UNIDADE_PADRAO:       'Restaurante Comunitário de Sobradinho',
  REFRESH_INTERVAL_MS:  5 * 60 * 1000,
  POR_PAGINA_PADRAO:    10,
};

// Acesso seguro ao localStorage (Edge bloqueia em modo InPrivate/rastreamento)
const STORE = {
  get(k)    { try { return localStorage.getItem(k); }    catch(e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); }        catch(e) {} },
  remove(k) { try { localStorage.removeItem(k); }        catch(e) {} },
};
