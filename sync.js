/* Sincronización opcional con Firebase (Auth + Firestore).
   Si firebase-config.js tiene null, este módulo no hace nada y la app queda 100 % local. */
const CFG = window.FIREBASE_CONFIG;
const V = '10.14.1';
const BASE = `https://www.gstatic.com/firebasejs/${V}/`;
const listeners = new Set();
const Sync = {
  state: CFG ? 'signedout' : 'off',   // off | signedout | connecting | online | error
  user: null,
  error: '',
  onStatus(fn){ listeners.add(fn); },
  changed(){}, login(){}, logout(){}, nextNum: async () => null
};
window.Sync = Sync;
const emit = () => listeners.forEach(fn => { try { fn(); } catch (e) {} });
const setState = (s, err = '') => { Sync.state = s; Sync.error = err; emit(); };

if (CFG) init().catch(e => setState('error', 'No se pudo cargar Firebase. ¿Hay conexión? ' + (e.message || e)));

async function init(){
  const [appM, authM, fsM] = await Promise.all([
    import(BASE + 'firebase-app.js'),
    import(BASE + 'firebase-auth.js'),
    import(BASE + 'firebase-firestore.js')
  ]);
  const app = appM.initializeApp(CFG);
  const auth = authM.getAuth(app);
  const db = fsM.initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() })
  });
  const { collection, doc, setDoc, deleteDoc, onSnapshot, runTransaction } = fsM;

  const COLS = ['products', 'clients', 'orders'];
  const colRef = n => collection(db, 'espacio', 'main', n);
  const setRef = () => doc(db, 'espacio', 'main', 'meta', 'settings');
  const cntRef = () => doc(db, 'espacio', 'main', 'meta', 'counter');

  const stable = o => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v))
    ? Object.keys(v).sort().reduce((a, x) => (a[x] = v[x], a), {}) : v);
  let pushed = { products: {}, clients: {}, orders: {}, settings: '' };
  let unsubs = [], timer = null, ready = {}, firstRemote = {}, applying = false;

  const A = () => window.APP;

  function pushDiff(){
    if (Sync.state !== 'online') return;
    const S = A().S;
    COLS.forEach(n => {
      const local = {};
      (S[n] || []).forEach(x => local[x.id] = x);
      Object.keys(local).forEach(id => {
        const j = stable(local[id]);
        if (pushed[n][id] !== j) {
          pushed[n][id] = j;
          setDoc(doc(db, 'espacio', 'main', n, id), JSON.parse(j)).catch(e => { delete pushed[n][id]; console.warn('sync set', e); });
        }
      });
      Object.keys(pushed[n]).forEach(id => {
        if (!local[id]) {
          const prev = pushed[n][id];
          delete pushed[n][id];
          deleteDoc(doc(db, 'espacio', 'main', n, id)).catch(e => { pushed[n][id] = prev; console.warn('sync del', e); });
        }
      });
    });
    const sj = stable(S.settings);
    if (pushed.settings !== sj) {
      pushed.settings = sj;
      setDoc(setRef(), JSON.parse(sj)).catch(e => { pushed.settings = ''; console.warn('sync settings', e); });
    }
  }

  Sync.changed = () => {
    if (applying || Sync.state !== 'online') return;
    clearTimeout(timer);
    timer = setTimeout(() => { if (initialDone()) pushDiff(); }, 700);
  };

  const initialDone = () => COLS.every(n => ready[n]) && ready.settings;

  // Cuando llegan las cuatro primeras lecturas: decidir si manda lo remoto o lo local
  function afterFirstLoad(){
    const S = A().S;
    const remoteHasData = COLS.some(n => Object.keys(pushed[n]).length) || !!pushed.settings;
    if (S.sample && remoteHasData) {
      // este equipo solo tenía datos de ejemplo: se usan los de la nube
      applying = true;
      S.sample = false;
      A().persist();
      applying = false;
      A().render();
    } else if (!remoteHasData || !S.sample) {
      // la nube está vacía (primera vez) o este equipo tiene datos propios: se suben
      if (!S.sample) pushDiff();
    }
  }

  function listen(){
    unsubs.forEach(u => u()); unsubs = []; ready = {}; firstRemote = {};
    pushed = { products: {}, clients: {}, orders: {}, settings: '' };
    COLS.forEach(n => {
      unsubs.push(onSnapshot(colRef(n), snap => {
        const S = A().S; let touched = false;
        applying = true;
        snap.docChanges().forEach(ch => {
          if (ch.doc.metadata.hasPendingWrites) return;      // eco de un cambio propio
          const id = ch.doc.id, data = { ...ch.doc.data(), id };
          const arr = S[n];
          const i = arr.findIndex(x => x.id === id);
          if (ch.type === 'removed') { if (i >= 0) { arr.splice(i, 1); touched = true; } delete pushed[n][id]; }
          else {
            const j = stable(data); pushed[n][id] = j;
            if (i < 0) { arr.push(data); touched = true; }
            else if (stable(arr[i]) !== j) { arr[i] = data; touched = true; }
          }
        });
        // la primera carga reemplaza los datos de ejemplo
        if (!firstRemote[n]) {
          firstRemote[n] = true;
          if (S.sample && snap.size) {
            const ids = new Set(snap.docs.map(d => d.id));
            S[n] = S[n].filter(x => ids.has(x.id));
            touched = true;
          }
        }
        if (touched) A().persist();
        applying = false;
        const first = !ready[n]; ready[n] = true;
        if (touched) A().safeRender();
        if (first && initialDone()) afterFirstLoad();
      }, err => setState('error', 'Error de sincronización: ' + err.message)));
    });
    unsubs.push(onSnapshot(setRef(), snap => {
      const S = A().S;
      if (snap.exists() && !snap.metadata.hasPendingWrites) {
        applying = true;
        const d = snap.data();
        S.settings = { ...S.settings, ...d };
        pushed.settings = stable(S.settings);
        A().persist();
        applying = false;
        A().safeRender();
      }
      const first = !ready.settings; ready.settings = true;
      if (first && initialDone()) afterFirstLoad();
    }, err => setState('error', 'Error de sincronización: ' + err.message)));
  }

  Sync.nextNum = async localMax => {
    if (Sync.state !== 'online' || !navigator.onLine) return null;
    try {
      const run = runTransaction(db, async tx => {
        const s = await tx.get(cntRef());
        const cur = s.exists() ? (s.data().n || 0) : 0;
        const nx = Math.max(cur, localMax) + 1;
        tx.set(cntRef(), { n: nx });
        return nx;
      });
      return await Promise.race([run, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]);
    } catch (e) { return null; }
  };

  Sync.login = async (email, pass) => {
    setState('connecting');
    try { await authM.signInWithEmailAndPassword(auth, email, pass); }
    catch (e) {
      const m = { 'auth/invalid-credential': 'Correo o contraseña incorrectos.', 'auth/invalid-email': 'El correo no es válido.',
        'auth/too-many-requests': 'Demasiados intentos. Probá más tarde.', 'auth/network-request-failed': 'Sin conexión.' }[e.code];
      setState('signedout', m || e.message);
    }
  };
  Sync.logout = async () => { await authM.signOut(auth); };

  authM.onAuthStateChanged(auth, u => {
    Sync.user = u ? u.email : null;
    if (u) { setState('online'); listen(); }
    else { unsubs.forEach(x => x()); unsubs = []; setState('signedout'); }
  });
}
