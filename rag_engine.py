import os, re, logging, numpy as np
from sentence_transformers import SentenceTransformer
from openai import OpenAI
from dotenv import load_dotenv
from sklearn.metrics.pairwise import cosine_similarity
from prompt import get_functional_prompt
from cache import RAGCache

load_dotenv()
logger = logging.getLogger(__name__)

# Configuración centralizada de Agentes y sus Tomos
AGENT_CONFIG = {
    "CALCULADOR": None,
    "GESTOR": None,
    "ESTRATEGA": None,
    "LEXICOGRAFO": None,
    "BIBLIOTECARIO": None,
    "GENERAL": None
}

# Tomos más relevantes por tipo de agente (para boost de scoring)
AGENT_TOMO_BOOST = {
    "CALCULADOR": ["6", "3", "5"],        # Zonificación, desarrollos, ambiente
    "GESTOR":     ["2", "3", "4", "11"],  # Procedimientos, permisos, licencias, revisiones
    "ESTRATEGA":  ["1", "7", "11"],       # Sistema, JP, revisiones administrativas
    "LEXICOGRAFO":["12", "1"],            # Glosario, definiciones generales
    "BIBLIOTECARIO": None,                # Universal
}


class RAGEngine:
    _instance = None

    def __new__(cls):
        if not cls._instance:
            cls._instance = super().__new__(cls)
            cls._instance._init()
        return cls._instance

    def _init(self):
        self.client = OpenAI(
            api_key=os.getenv("OPENAI_KEY")
        )
        self.deployment_name = os.getenv("OPENAI_MODEL", "gpt-3.5-turbo")
        _model_cache = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models')
        os.makedirs(_model_cache, exist_ok=True)
        self.embedding_model = SentenceTransformer(
            os.getenv('LOCAL_EMBEDDING_MODEL', 'sentence-transformers/paraphrase-multilingual-mpnet-base-v2'),
            cache_folder=_model_cache
        )
        self.cache = RAGCache()

        data = self.cache.load()
        if data:
            self.chunks, self.embeddings = data
            model_dim = self.embedding_model.get_sentence_embedding_dimension()
            if self.embeddings is not None and self.embeddings.shape[1] != model_dim:
                logger.warning(f"⚠️ Dimension mismatch ({self.embeddings.shape[1]} vs {model_dim}). Regenerating...")
                self.chunks = self._load()
                self.embeddings = self.embedding_model.encode([c["content"] for c in self.chunks]) if self.chunks else None
                if self.chunks:
                    self.cache.save(self.chunks, self.embeddings)
            else:
                logger.info(f"✅ RAG: {len(self.chunks)} chunks cacheados")
        else:
            self.chunks = self._load()
            self.embeddings = self.embedding_model.encode([c["content"] for c in self.chunks]) if self.chunks else None
            if self.chunks:
                self.cache.save(self.chunks, self.embeddings)

        if self.chunks:
            self._build_indices()

    # =========================================================================
    # FIX 1: OCR CORRECTOR — 'ó' -> '6' en contextos numéricos
    # =========================================================================
    def _fix_ocr(self, content: str) -> str:
        """
        Corrige el artefacto OCR donde el número '6' fue interpretado como 'ó'.
        Esto afectaba gravemente al Tomo 6 (Distritos de Calificación) y otros tomos,
        haciendo que sus encabezados (CAPÍTULO 6.x, REGLA 6.x.x) fueran invisibles
        al parser de regex, dejando el tomo completo en solo 9 chunks gigantes.
        """
        # Headers: CAPÍTULO ó.X / REGLA ó.X.X / SECCION ó.X.X.X
        content = re.sub(r'((?:CAP[IÍ]TULO|REGLA|SECCI[OÓ]N)\s+)ó\.', r'\g<1>6.', content, flags=re.I)
        # Números internos: 9.ó.2 -> 9.6.2
        content = re.sub(r'(\d+\.)ó(\.\d)', r'\g<1>6\2', content)
        content = re.sub(r'(\d+\.)ó\b', r'\g<1>6', content)
        # Inicio de sección: ó.1 -> 6.1
        content = re.sub(r'\bó\.(\d)', r'6.\1', content)
        content = re.sub(r'^ó\.(\d)', r'6.\1', content, flags=re.MULTILINE)
        return content

    # =========================================================================
    # FIX 2: CHUNKER MEJORADO — herencia de contexto en chunks vacíos
    # =========================================================================
    def _load(self):
        import glob
        chunks = []
        patterns = [
            (r'^TOMO[\s_]+([IVXLCDM]+|[0-9]+)', "tomo", "TOMO"),
            (r'^T[OÓ]PICO\s+(\d+(?:\.\d+)?)', "top", "TOPICO"),
            (r'^CAP[IÍ]TULO[\s_:.]+(\d+(?:\.\d+)?)', "cap", "CAPITULO"),
            (r'^REGLA\s+(\d+\.\d+\.\d+)(?!\.)', "reg", "REGLA"),
            (r'^SECCI[OÓ]N\s+(\d+(\.\d+)*)', "sec", "SECCION"),
            (r'^\s*TABLA\s+(\d+\.[\d\.]+)', "tab", "TABLA"),
            (r'^(\d+\.\d+\.\d+\.\d+)', "sec", "SECCION"),
            (r'^(\d+\.\d+\.\d+)(?!\.)', "reg", "REGLA"),
            (r'^(\d+\.\d+)(?!\.)', "cap", "CAPITULO"),
            (r'^ENMIENDA\s+([IVXLCDM]+|[0-9]+)', "enmienda", "ENMIENDA"),
            (r'^ART[IÍ]CULO\s+(.+)', "articulo", "ARTICULO"),
        ]
        regexes = [(re.compile(p, re.I), k, t) for p, k, t in patterns]

        _base = os.path.dirname(os.path.abspath(__file__))
        for path in glob.glob(os.path.join(_base, 'data', '*.txt')):
            fname = os.path.basename(path).lower()
            if 'constitucion' in fname or 'entrenamiento' in fname:
                lbl = 'CONSTITUCION'
            elif 'reglamento-num-13' in fname:
                lbl = 'REGLAMENTO13'
            elif 'reglamento43' in fname:
                lbl = 'REGLAMENTO43'
            elif (m := re.search(r'tomo(\d+)', fname)):
                lbl = m.group(1)
            else:
                lbl = fname.replace('.txt', '').upper()

            with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                raw_content = f.read()

            # FIX 1 APPLIED HERE: correct OCR before parsing
            content = self._fix_ocr(raw_content)

            curr, meta = [], {"tomo": lbl, "ref": lbl}
            pending_header_chunks = []  # FIX 2: track header-only chunks

            for line in filter(None, [l.strip() for l in content.split('\n')]):
                matched = False
                for pat, key, type_str in regexes:
                    m = pat.match(line)
                    if m:
                        if lbl == "TABLADECONTENIDO" and len(curr) < 1000 and type_str != "TOMO":
                            break

                        if curr:
                            txt = '\n'.join(curr).strip()
                            doc_prefix = f"Tomo {lbl}" if lbl.isdigit() else lbl.replace("REGLAMENTO", "Reglamento ")
                            if doc_prefix == "CONSTITUCION":
                                doc_prefix = "Constitución"

                            chunk = self._mk_chunk(curr, meta)
                            if chunk:
                                # FIX 2: if previous pending header chunks exist, append this content to them too
                                for ph in pending_header_chunks:
                                    ph['content'] += f"\n{txt[:300]}"  # inherit first 300 chars
                                pending_header_chunks = []
                                chunks.append(chunk)
                            else:
                                # This was a header-only chunk — queue it
                                pending_header_chunks.append({
                                    **meta,
                                    "content": '\n'.join(curr).strip(),
                                    "_pending": True
                                })

                        doc_prefix = f"Tomo {lbl}" if lbl.isdigit() else lbl.replace("REGLAMENTO", "Reglamento ")
                        if doc_prefix == "CONSTITUCION":
                            doc_prefix = "Constitución"

                        meta = {
                            "tomo": lbl,
                            "ref": self._build_ref(lbl, type_str.lower(), m.group(1), line),
                            "type": type_str.lower(),
                            "key_id": m.group(1)
                        }
                        curr = [line]
                        matched = True
                        break

                if not matched:
                    # Tomo 12: definiciones especiales
                    if lbl == "12" and (m := re.match(r'^(\d+\.\s+)?([^—~:-]{2,60})\s*[—~:-]', line)):
                        if curr:
                            chunk = self._mk_chunk(curr, meta)
                            if chunk:
                                chunks.append(chunk)
                        meta = {
                            "tomo": "12",
                            "ref": f"TOMO 12 - {m.group(2).strip().upper()}",
                            "type": "definicion"
                        }
                        curr = [line]
                    else:
                        curr.append(line)
                        # FIX 2: If we had pending header chunks, they now have content — flush them
                        if pending_header_chunks and len(curr) >= 3:
                            for ph in pending_header_chunks:
                                ph['content'] += '\n' + '\n'.join(curr[1:4])
                                if len(ph['content']) >= 30:
                                    ph.pop('_pending', None)
                                    chunks.append(ph)
                            pending_header_chunks = []

            if curr:
                chunk = self._mk_chunk(curr, meta)
                if chunk:
                    chunks.append(chunk)

        valid = [c for c in chunks if c and not c.get('_pending')]
        logger.info(f"📚 Chunks cargados: {len(valid)} (tras corrección OCR y chunker mejorado)")
        return valid

    def _build_ref(self, tomo: str, type_str: str, key_id: str, raw_line: str) -> str:
        """
        Construye la referencia jerárquica exacta:
          Tomo X, Capítulo X.X, Regla X.X.X, Sección X.X.X.X

        Regla de oro: el primer número de la jerarquía SIEMPRE coincide con el número
        del Tomo. Así Tomo 3 → Capítulo 3.X, Regla 3.X.X, Sección 3.X.X.X
        Para Reglamento 13 la notación es Sección X.XX (sin Tomo en el key_id).
        """
        # ── Documento base ────────────────────────────────────────────────
        if tomo.isdigit():
            doc = f"Tomo {tomo}"
        elif tomo == 'REGLAMENTO13':
            doc = 'Reglamento Núm. 13'
        elif tomo == 'REGLAMENTO43':
            doc = 'Reglamento Núm. 43'
        elif tomo == 'CONSTITUCION':
            doc = 'Constitución'
        else:
            doc = tomo.title()

        # ── Tipos que no tienen jerarquía numérica ────────────────────────
        if not key_id or type_str in ('tomo', 'enmienda', 'articulo', 'definicion', None):
            return f"{doc} - {raw_line.strip()}" if raw_line else doc

        # ── Reglamento 13: formato Sección X.XX (e.g. 7.01) ──────────────
        # En Reg. 13 los key_id son como "7", "7.01", "7.01(d)" — sin el
        # número de tomo como primer segmento, así que se tratan diferente.
        if tomo == 'REGLAMENTO13':
            parts = key_id.split('.')
            hierarchy = [doc]
            if len(parts) == 1:
                hierarchy.append(f"Tópico {parts[0]}")
            elif len(parts) >= 2:
                hierarchy.append(f"Sección {key_id}")
            return ', '.join(hierarchy)

        # ── Tomos 1-12: jerarquía Capítulo / Regla / Sección ─────────────
        parts = key_id.split('.')

        # Si el key_id no empieza con el número del tomo (e.g. tomo "3" pero
        # key_id = "1.2") lo usamos tal cual — respetamos lo que está en el doc.
        # Si sí empieza con el número del tomo ("3.1", "3.1.2") construimos
        # la jerarquía acumulativa completa.
        hierarchy = [doc]

        if len(parts) >= 2:
            hierarchy.append(f"Capítulo {'.'.join(parts[:2])}")
        if len(parts) >= 3:
            hierarchy.append(f"Regla {'.'.join(parts[:3])}")
        if len(parts) >= 4:
            hierarchy.append(f"Sección {'.'.join(parts[:4])}")
        if len(parts) >= 5:
            hierarchy.append(f"Sección {'.'.join(parts[:5])}")

        return ', '.join(hierarchy)

    def _mk_chunk(self, lines, meta):
        txt = '\n'.join(lines).strip()
        min_len = 30
        if meta.get('type') in ['tabla', 'definicion', 'tomo', 'enmienda']:
            min_len = 10
        return {**meta, "content": txt} if len(txt) >= min_len else None

    def _build_indices(self):
        self.d_idx = {}
        for c in self.chunks:
            if c.get('type') and c.get('key_id'):
                key = (c['type'], c['key_id'])
                self.d_idx.setdefault(key, []).append(c)
            c['_n_txt'] = self._norm(c['content'])
            c['_n_ref'] = self._norm(c.get('ref', ''))

    def _norm(self, t: str) -> str:
        for a, b in [("á","a"),("é","e"),("í","i"),("ó","o"),("ú","u"),("ü","u"),("ñ","n")]:
            t = t.replace(a, b).replace(a.upper(), b.upper())
        return t.lower()

    # =========================================================================
    # FIX 3: QUERY EXPANSION — siglas y equivalencias técnicas
    # =========================================================================
    def _expand_query_terms(self, query: str) -> str:
        """Expande siglas y términos técnicos para mejorar la recuperación semántica."""
        term_map = {
            "ibc": " código de construcción puerto rico building code seguridad estructural ",
            "international building code": " código de construcción puerto rico building code ",
            "iecc": " conservación de energía eficiencia energética ",
            "igcc": " código construcción verde green code ",
            "fire code": " prevención de incendios ",
            "arpe": " ogpe oficina gerencia permisos ",
            "reglamento 2020": " reglamento conjunto 2023 vigencia ",
            "reglamento 2010": " reglamento conjunto 2023 vigencia ",
            "nec": " código eléctrico ",
            "junta de apelaciones": " junta revisora ",
            "consulta de ubicación": " certificación cumplimiento ambiental variación uso ",
            "consulta de ubicacion": " certificación cumplimiento ambiental variación uso ",
            "permiso de uso": " permiso único certificación prevención incendios ",
            "exentos": " exención exento exentos proyectos excluidos no aplica ",
            "exaccion": " exacción por impacto aportaciones cargo ",
            "exacción": " exacción por impacto aportaciones cargo ",
            "densidad": " metros cuadrados por unidad solar cabida unidades permitidas ",
            "cuántos caben": " densidad cabida solar metros cuadrados unidades ",
            "cuantos caben": " densidad cabida solar metros cuadrados unidades ",
            "retiro": " patio retiro mínimo frente fondo lateral ",
            "fachada": " frente solar retiro distancia ",
            "altura": " plantas pisos metros altura máxima edificación ",
            "uso permitido": " usos permitidos tabla usos distrito calificación ",
            "uso prohibido": " usos prohibidos tabla usos restricciones ",
            # Enmiendas constitucionales — variaciones de nombres
            "enmienda v": " Enmienda V quinta enmienda due process debido proceso propiedad privada indemnización justa gran jurado doble exposición ",
            "enmienda 5": " Enmienda V quinta enmienda due process debido proceso propiedad privada indemnización justa ",
            "quinta enmienda": " Enmienda V due process debido proceso propiedad privada indemnización ",
            "fifth amendment": " Enmienda V due process debido proceso propiedad privada ",
            "due process": " Enmienda V Enmienda XIV debido proceso vida libertad propiedad ",
            "debido proceso": " Enmienda V Enmienda XIV due process vida libertad propiedad ",
            "enmienda xiv": " Enmienda XIV decimocuarta ciudadanía igual protección debido proceso ",
            "enmienda 14": " Enmienda XIV decimocuarta ciudadanía igual protección debido proceso ",
            "enmienda i": " Enmienda I primera libertad expresión religión prensa ",
            "enmienda 1": " Enmienda I primera libertad expresión religión prensa ",
            "enmienda iv": " Enmienda IV cuarta registro allanamiento orden judicial ",
            "enmienda 4": " Enmienda IV cuarta registro allanamiento orden judicial ",
            "expropiacion": " Enmienda V propiedad privada uso público indemnización justa taking ",
            "expropiación": " Enmienda V propiedad privada uso público indemnización justa ",
            "taking": " Enmienda V expropiación propiedad privada indemnización justa ",
        }
        query_lower = query.lower()
        expanded = query
        for term, expansion in term_map.items():
            if term in query_lower:
                expanded += expansion
        return expanded

    # =========================================================================
    # FIX 4: SCORING MEJORADO
    # =========================================================================
    def _score(self, q_norm: str, ch: dict, base_score: float, agent: str = "GENERAL") -> float:
        sc = base_score
        c_txt = ch['_n_txt']
        c_ref = ch['_n_ref']
        ch_type = ch.get('type', '')
        ch_tomo = str(ch.get('tomo', ''))

        # Boost por tipo de chunk
        if 'tomo' in q_norm and ch_type == 'tomo':
            sc *= 3.0
        if 'enmienda' in q_norm and 'enmienda' in ch_type:
            sc *= 2.0

        # FIX 4a: Boost por tomo relevante para el agente
        agent_boosts = AGENT_TOMO_BOOST.get(agent)
        if agent_boosts and ch_tomo in agent_boosts:
            sc *= 1.4

        # FIX 4b: Keywords con peso diferenciado
        q_words = [w for w in q_norm.split() if len(w) > 3]
        if q_words:
            # Hits en contenido
            content_hits = sum(1 for w in q_words if w in c_txt)
            sc += 0.08 * content_hits  # was 0.05

            # Hits en referencia (encabezado) — más valioso
            ref_hits = sum(1 for w in q_words if w in c_ref)
            sc += 0.35 * ref_hits  # was 0.3

            # FIX 4c: Bonus por densidad de keywords (muchos hits = muy relevante)
            if len(q_words) > 0:
                density = content_hits / len(q_words)
                if density > 0.5:
                    sc *= 1.2  # 20% bonus si más del 50% de keywords aparecen

        # FIX 4d: Penalizar chunks muy cortos (probablemente header-only sin contexto)
        if len(c_txt) < 100:
            sc *= 0.7

        return sc

    # =========================================================================
    # RETRIEVE — búsqueda híbrida mejorada
    # =========================================================================
    def retrieve(self, query: str, top_k: int = 12, allowed: list = None, agent: str = "GENERAL", user_msg: str = "") -> list:
        if not self.chunks or self.embeddings is None:
            return []

        res, seen = [], set()

        # 1. Direct Hit — búsqueda exacta por número de sección
        # Normalizar query para direct hit (manejar 'Sección' -> 'SECCION', etc.)
        q_normalized = re.sub(r'secci[oó]n', 'SECCION', query, flags=re.I)
        q_normalized = re.sub(r'cap[ií]tulo', 'CAPITULO', q_normalized, flags=re.I)

        if (m := re.search(r'(TABLA|REGLA|SECCI[OÓ]N|CAP[IÍ]TULO|T[OÓ]PICO)?\s*(\d+(\.\d+)*)', q_normalized, re.I)):
            p = (m.group(1).lower() if m.group(1) else "")
            k = m.group(2)
            t = None
            if "tab" in p:
                t = "tabla"
            elif "top" in p:
                t = "topico"
            else:
                pt = len(k.split('.'))
                t = "capitulo" if pt == 2 else ("regla" if pt == 3 else ("seccion" if pt >= 4 else None))

            if t:
                hits = [c for c in self.d_idx.get((t, k), [])
                        if c['content'] not in seen
                        and (allowed is None or str(c.get('tomo')) in allowed)
                        and not seen.add(c['content'])]
                res.extend(hits)

        # Direct Hit para ENMIENDA (numeración romana o árabe)
        # Busca tanto en la query del LLM como en el texto expandido (cubre casos
        # donde el LLM usa query semántica en vez del nombre literal Enmienda X)
        _TO_ROMAN = {'1':'I','2':'II','3':'III','4':'IV','5':'V','6':'VI','7':'VII',
                     '8':'VIII','9':'IX','10':'X','11':'XI','12':'XII','13':'XIII',
                     '14':'XIV','15':'XV','16':'XVI','17':'XVII','18':'XVIII','19':'XIX','20':'XX'}
        _FROM_ROMAN = {v: v for v in _TO_ROMAN.values()}  # identidad para romanos
        # Aliases: «quinta enmienda» → V, «decimocuarta» → XIV, etc.
        _ALIAS_MAP = {
            'quinta': 'V', 'fifth': 'V', 'cuarta': 'IV', 'fourth': 'IV',
            'primera': 'I', 'first': 'I', 'decimocuarta': 'XIV', 'fourteenth': 'XIV',
        }
        _enm_search_targets = [q_normalized, query, user_msg]  # incluir mensaje original del usuario
        enm_found = set()
        for _target in _enm_search_targets:
            if (em := re.search(r'\bENMIENDA\s+([IVXLCDM]+|[0-9]+)', _target, re.I)):
                enm_found.add(em.group(1).upper())
            # Alias: «quinta enmienda», «fifth amendment»
            for alias, roman in _ALIAS_MAP.items():
                if alias in _target.lower() and 'enmienda' in _target.lower() or \
                   alias in _target.lower() and 'amendment' in _target.lower():
                    enm_found.add(roman)
        for enm_key in enm_found:
            search_keys = [enm_key]
            if enm_key.isdigit():
                search_keys.append(_TO_ROMAN.get(enm_key, enm_key))
            for ekey in search_keys:
                hits = [c for c in self.d_idx.get(("enmienda", ekey), [])
                        if c['content'] not in seen
                        and (allowed is None or str(c.get('tomo')) in allowed)
                        and not seen.add(c['content'])]
                res.extend(hits)

        # 2. Semantic search con query expandida
        expanded_query = self._expand_query_terms(query)
        q_emb = self.embedding_model.encode([expanded_query])
        sims = cosine_similarity(q_emb, self.embeddings)[0]

        # Top 150 candidatos (was 100) para mayor recall
        n_candidates = min(150, len(sims))
        idxs = np.argpartition(sims, -n_candidates)[-n_candidates:] if len(sims) > n_candidates else range(len(sims))

        q_n = self._norm(expanded_query)
        candidates = [
            (self._score(q_n, self.chunks[i], sims[i], agent), self.chunks[i])
            for i in idxs
            if sims[i] >= 0.08  # FIX: lower threshold (was 0.1) for Spanish legal text
            and (allowed is None or str(self.chunks[i].get('tomo')) in allowed)
        ]
        ranked = sorted(candidates, key=lambda x: x[0], reverse=True)

        for score, ch in ranked:
            if len(res) >= top_k:
                break
            if ch['content'] not in seen:
                ch['_score'] = score
                res.append(ch)
                seen.add(ch['content'])

        # FIX: Fallback — si hay pocos resultados, bajar umbral de similitud
        if len(res) < 3 and allowed:
            extra = [
                (self._score(q_n, self.chunks[i], sims[i], agent), self.chunks[i])
                for i in idxs
                if sims[i] >= 0.05
                and (allowed is None or str(self.chunks[i].get('tomo')) in allowed)
                and self.chunks[i]['content'] not in seen
            ]
            extra_sorted = sorted(extra, key=lambda x: x[0], reverse=True)
            for score, ch in extra_sorted[:5]:
                if ch['content'] not in seen:
                    ch['_score'] = score
                    res.append(ch)
                    seen.add(ch['content'])

        return res

    # =========================================================================
    # LOCAL ROUTER — Clasificación sin llamada API (ahorra 1-2s por consulta)
    # =========================================================================
    def _classify_local(self, query: str) -> str:
        """Clasifica el agente usando keywords locales. Reemplaza la llamada API al router."""
        q = self._norm(query)

        # BIBLIOTECARIO — peticiones de índice/estructura/navegación
        if any(kw in q for kw in ['lista los tomos', 'dame el indice', 'cuales son los capitulos',
                                   'que contiene el tomo', 'estructura del reglamento', 'indice del reglamento',
                                   'dame un resumen de todos', 'resumen de todos los tomos', 'resumen de los tomos',
                                   'lista todos los tomos', 'que tomos hay', 'que tomos existen',
                                   'cuantos tomos', 'todos los tomos', 'dame los tomos',
                                   'que hay en el tomo', 'que cubre el tomo', 'contenido del tomo']):
            return "BIBLIOTECARIO"

        # LEXICOGRAFO — definiciones y conceptos
        if any(kw in q for kw in ['que significa', 'que es un ', 'que es el ', 'que es la ',
                                   'definicion de', 'define ', 'glosario', 'sigla']):
            return "LEXICOGRAFO"

        # CALCULADOR — cálculos, zonificación, parámetros
        if any(kw in q for kw in ['cuantos caben', 'densidad', 'cbu', 'cabida basica', 'retiro',
                                   'altura maxima', 'area de ocupacion', 'tabla 6', 'tabla 9',
                                   'usos permitidos', 'usos prohibidos', 'parametros', 'frente minimo',
                                   'cuantas unidades', 'ocupacion maxima', 'calcul', 'metros cuadrados',
                                   'freeboard', 'bfe', 'nivel de piso', 'zona ae', 'zona ve', 'zona ao',
                                   'asce 24', 'pared desprendible', 'abertura de venteo', 'relleno en zona',
                                   'r-1', 'r-2', 'r-3', 'r-4', 'r-b', 'r-m', 'r-a',
                                   'c-1', 'c-2', 'c-3', 'i-1', 'i-2', 'distrito de calificacion']):
            return "CALCULADOR"

        # ESTRATEGA — interpretación legal, jerarquía, conflictos
        if any(kw in q for kw in ['conflicto', 'jerarquia', 'constitucion', 'prevalece', 'es legal',
                                   'puede el municipio', 'interpretacion', 'laguna', 'impugnar',
                                   'norma mas estricta', 'enmienda xiv', 'enmienda 14', 'enmienda v',
                                   'enmienda 5', 'enmienda i', 'enmienda 1', 'enmienda iv', 'enmienda 4',
                                   'carta de derechos', 'debido proceso', 'expropiacion', 'due process',
                                   'derechos constitucionales', 'derechos fundamentales']):
            return "ESTRATEGA"

        # GESTOR — trámites, permisos, procedimientos, documentos
        if any(kw in q for kw in ['como solicito', 'que documentos', 'donde radico', 'permiso',
                                   'tramite', 'plazo', 'agencia', 'licencia', 'certificacion',
                                   'como obtengo', 'donde habla', 'penalidad', 'certificado de elevacion',
                                   'estudio h-h', 'enmienda al firm', 'ogpe', 'drna', 'solicitud',
                                   'que necesito', 'pasos para', 'procedimiento', 'como aplico',
                                   'variacion', 'recurso de revision']):
            return "GESTOR"

        return "GENERAL"

    # =========================================================================
    # GET RESPONSE — ReAct loop (sin streaming, compatible con wfastcgi/IIS)
    # =========================================================================
    def get_response(self, msg: str, history: list = None, filtro_usuario: str = None):
        """Genera la respuesta como generador de (token, refs, agent) tuples.
        Siempre es un generador (streaming). Primero hace tool-calling síncronamente,
        luego hace streaming de la respuesta final."""
        import json
        try:
            agent = self._classify_local(msg)
            logger.info(f"🤖 LegalBot [{agent}] (local router) iniciando ReAct...")

            tools = [
                {
                    "type": "function",
                    "function": {
                        "name": "buscar_base_legal",
                        "description": (
                            "Busca en las bases de datos legales de la Junta de Planificación. "
                            "Usa esta herramienta SIEMPRE antes de responder. "
                            "Puedes llamarla múltiples veces con diferentes términos."
                        ),
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "reglamento": {
                                    "type": "string",
                                    "enum": ["CONSTITUCION", "REGLAMENTO_CONJUNTO", "REGLAMENTO_13", "TODOS"],
                                    "description": "Reglamento donde buscar."
                                },
                                "query": {
                                    "type": "string",
                                    "description": "Término de búsqueda semántico breve y específico."
                                }
                            },
                            "required": ["reglamento", "query"]
                        }
                    }
                }
            ]

            sliced_history = (history or [])[-8:]

            _FILTRO_MAP = {
                'conjunto':     ('REGLAMENTO_CONJUNTO', [str(i) for i in range(1, 13)]),
                'reglamento13': ('REGLAMENTO_13',       ['REGLAMENTO13']),
                'reglamento43': ('REGLAMENTO_43',       ['REGLAMENTO43']),
                'constitucion': ('CONSTITUCION',        ['CONSTITUCION']),
            }
            user_f = str(filtro_usuario).lower().strip() if filtro_usuario else 'todos'
            filtro_enum, filtro_tomos = _FILTRO_MAP.get(user_f, (None, None))

            filtro_instruccion = ""
            if filtro_enum:
                filtro_instruccion = (
                    f"\n\n⚠️ RESTRICCIÓN OBLIGATORIA: El usuario seleccionó ÚNICAMENTE [{filtro_enum}]. "
                    f"Llama a buscar_base_legal SIEMPRE con reglamento=\"{filtro_enum}\".\n"
                )
                logger.info(f"🔒 Filtro '{user_f}' → enum={filtro_enum}")

            system_prompt = (
                get_functional_prompt(agent)
                + "\n\n"
                + "════════════════════════════════════════════════════════\n"
                + "INSTRUCCIONES OBLIGATORIAS DE BÚSQUEDA Y REFERENCIAS\n"
                + "════════════════════════════════════════════════════════\n"
                + "1. SIEMPRE usa `buscar_base_legal` antes de responder. NUNCA respondas sin buscar.\n"
                + "2. Puedes buscar hasta 3 veces con distintos términos si los primeros resultados son insuficientes.\n"
                + "3. ⛔ PROHIBIDO ABSOLUTO: NO inventes referencias. "
                + "CADA cita DEBE aparecer LITERALMENTE en el campo [ref] del resultado devuelto por la herramienta.\n"
                + "\n"
                + "FORMATO EXACTO DE REFERENCIAS (copia el [ref] del resultado tal como aparece):\n"
                + "  ✅ Tomo 3, Capítulo 3.1, Regla 3.1.2, Sección 3.1.2.1\n"
                + "  ✅ Tomo 6, Capítulo 6.3, Regla 6.3.1\n"
                + "  ✅ Tomo 12 - PERMISO DE USO  (Glosario — sin Capítulo ni Regla)\n"
                + "  ✅ Reglamento Núm. 13, Sección 7.01\n"
                + "  ❌ NUNCA: 'Capítulo 3.1' sin el Tomo al inicio\n"
                + "  ❌ NUNCA: 'Tomo 3, Regla 1.2' (saltarse el Capítulo)\n"
                + "  ❌ NUNCA: inventar un nivel de jerarquía que no aparece en el [ref]\n"
                + "\n"
                + "REGLA DE JERARQUÍA (el número del Tomo es el primer segmento de cada nivel):\n"
                + "  Tomo 3  → Capítulo 3.X  → Regla 3.X.X  → Sección 3.X.X.X\n"
                + "  Tomo 6  → Capítulo 6.X  → Regla 6.X.X  → Sección 6.X.X.X\n"
                + "  Tomo 12 → SOLO Tomo 12 - NOMBRE DEL TÉRMINO (es glosario, no tiene Capítulos)\n"
                + "  Reglamento Núm. 13 → Sección X.XX (sin 'Tomo' al inicio)\n"
                + "\n"
                + "4. ⛔ PROHIBIDO: usar conocimiento propio de entrenamiento. "
                + "SOLO puedes usar lo que devuelva `buscar_base_legal`.\n"
                + filtro_instruccion
            )

            messages = (
                [{"role": "system", "content": system_prompt}]
                + sliced_history
                + [{"role": "user", "content": msg}]
            )

            MAX_ITER = 3
            iter_count = 0
            refs = []

            while iter_count < MAX_ITER:
                iter_count += 1

                response = self.client.chat.completions.create(
                    model=self.deployment_name,
                    messages=messages,
                    tools=tools,
                    tool_choice="auto",
                    temperature=0.1,
                    max_tokens=1200,
                    stream=False
                )

                resp_msg = response.choices[0].message

                if not resp_msg.tool_calls:
                    # El modelo ya tiene suficiente info — hacer streaming de la respuesta final
                    final_resp = resp_msg.content.strip() if resp_msg.content else ""
                    final_resp = re.sub(r'^Agente \w+:[^\n]*\n?', '', final_resp).strip()
                    logger.info(f"✅ [{agent}] Respondió en {iter_count} iter | {len(refs)} refs")
                    if not final_resp:
                        final_resp = "No pude encontrar información suficiente. Por favor reformula tu consulta."
                    # Streaming manual del texto ya listo (token a token)
                    yield from self._stream_text(final_resp, refs, agent)
                    return

                messages.append(resp_msg)

                for tc in resp_msg.tool_calls:
                    if tc.function.name == "buscar_base_legal":
                        args = json.loads(tc.function.arguments)
                        reg_choice = args.get("reglamento", "TODOS")
                        raw_query = args.get("query", msg)
                        query = self._expand_query_terms(raw_query)

                        logger.info(f"🛠️  [{agent}] Iter {iter_count} → {reg_choice}: '{raw_query}'")

                        allowed_tomos = None
                        if reg_choice == "CONSTITUCION":
                            allowed_tomos = ["CONSTITUCION"]
                        elif reg_choice == "REGLAMENTO_13":
                            allowed_tomos = ["REGLAMENTO13"]
                        elif reg_choice == "REGLAMENTO_CONJUNTO":
                            allowed_tomos = [str(i) for i in range(1, 13)]
                        else:  # TODOS
                            allowed_tomos = None

                        if filtro_tomos is not None:
                            allowed_tomos = filtro_tomos

                        if AGENT_CONFIG.get(agent):
                            allowed_tomos = list(set(allowed_tomos or []) & set(AGENT_CONFIG[agent])) or AGENT_CONFIG[agent]

                        res = self.retrieve(query, top_k=15, allowed=allowed_tomos, agent=agent, user_msg=msg)

                        if not res:
                            ctx_text = (
                                f"⚠️ La búsqueda '{raw_query}' en {reg_choice} devolvió 0 resultados. "
                                "Intenta con sinónimos o busca en TODOS."
                            )
                        else:
                            ctx_text = f"RESULTADOS ({len(res)} encontrados):\n\n"
                            for r in res[:8]:
                                ctx_text += f"📌 CITAR EXACTAMENTE COMO: \"{r['ref']}\"\n{r['content'][:1500]}\n\n---\n\n"
                                refs.append(r['ref'])

                        messages.append({
                            "tool_call_id": tc.id,
                            "role": "tool",
                            "name": tc.function.name,
                            "content": ctx_text
                        })

            # Límite de iteraciones: pedir una respuesta final con streaming real
            logger.warning(f"⏱️ [{agent}] Límite de {MAX_ITER} iter alcanzado, streaming final...")
            final_stream = self.client.chat.completions.create(
                model=self.deployment_name,
                messages=messages,
                temperature=0.1,
                max_tokens=1200,
                stream=True
            )
            full = []
            for chunk in final_stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    token = chunk.choices[0].delta.content
                    full.append(token)
                    yield {"token": token, "refs": refs, "agent": agent, "done": False}
            yield {"token": "", "refs": list(dict.fromkeys(refs)), "agent": agent, "done": True}

        except Exception as e:
            logger.error(f"❌ Error en get_response: {e}", exc_info=True)
            yield {"error": str(e)}

    def _stream_text(self, text: str, refs: list, agent: str):
        """Simula streaming de un texto ya generado, enviando token a token (palabras)."""
        words = text.split(' ')
        for i, word in enumerate(words):
            token = word if i == 0 else ' ' + word
            yield {"token": token, "refs": refs, "agent": agent, "done": False}
        yield {"token": "", "refs": list(dict.fromkeys(refs)), "agent": agent, "done": True}