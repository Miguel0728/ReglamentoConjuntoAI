import os
import json
import pickle
import logging

logger = logging.getLogger(__name__)

class RAGCache:
    def __init__(self, cache_dir='cache', cache_file='rag_cache.pkl'):
        _base = os.path.dirname(os.path.abspath(__file__))
        self.cache_dir = os.path.join(_base, cache_dir)
        self.cache_file = cache_file
        self.data_dir = os.path.join(_base, 'data')
        self.cache_path = os.path.join(self.cache_dir, self.cache_file)
        self.meta_path = os.path.join(self.cache_dir, 'rag_cache_meta.json')
        os.makedirs(self.cache_dir, exist_ok=True)

    def get_source_files(self):
        """Retorna la lista de archivos que componen el conocimiento del bot."""
        import glob
        files = glob.glob(os.path.join(self.data_dir, '*.txt'))
        return [f for f in files if os.path.exists(f)]

    def _get_current_file_snapshot(self):
        """Retorna {path: mtime} de todos los archivos fuente actuales."""
        return {f: os.path.getmtime(f) for f in self.get_source_files()}

    def is_valid(self):
        """Verifica si el caché existe e incluye exactamente los archivos fuente actuales."""
        if not os.path.exists(self.cache_path):
            return False

        # Si no hay metadata (cache viejo), invalidar para regenerar con metadata
        if not os.path.exists(self.meta_path):
            logger.info("⚠️ Caché sin metadata de archivos. Regenerando para incluir todos los archivos.")
            return False

        try:
            with open(self.meta_path, 'r', encoding='utf-8') as f:
                cached_meta = json.load(f)
        except Exception:
            return False

        current = self._get_current_file_snapshot()
        cached_files = cached_meta.get('files', {})

        # Detectar archivos añadidos o eliminados
        if set(current.keys()) != set(cached_files.keys()):
            added = set(current.keys()) - set(cached_files.keys())
            removed = set(cached_files.keys()) - set(current.keys())
            if added:
                logger.info(f"⚠️ Archivos nuevos detectados: {[os.path.basename(f) for f in added]}. Regenerando caché.")
            if removed:
                logger.info(f"⚠️ Archivos eliminados: {[os.path.basename(f) for f in removed]}. Regenerando caché.")
            return False

        # Detectar archivos modificados
        for path, mtime in current.items():
            cached_mtime = cached_files.get(path, 0)
            if abs(mtime - cached_mtime) > 1:  # tolerancia de 1 segundo
                logger.info(f"⚠️ Archivo {os.path.basename(path)} modificado. Regenerando caché.")
                return False

        return True

    def load(self):
        """Carga los chunks y embeddings desde el archivo de caché."""
        if not self.is_valid():
            return None

        try:
            with open(self.cache_path, 'rb') as f:
                data = pickle.load(f)
                return data.get('chunks'), data.get('embeddings')
        except Exception as e:
            logger.warning(f"⚠️ Error cargando caché: {e}")
            return None

    def save(self, chunks, embeddings):
        """Guarda los chunks y embeddings en el archivo de caché."""
        try:
            data = {
                'chunks': chunks,
                'embeddings': embeddings
            }
            with open(self.cache_path, 'wb') as f:
                pickle.dump(data, f, protocol=pickle.HIGHEST_PROTOCOL)

            # Guardar metadata con inventario de archivos incluidos
            snapshot = self._get_current_file_snapshot()
            with open(self.meta_path, 'w', encoding='utf-8') as f:
                json.dump({'files': snapshot}, f, indent=2)

            logger.info(f"💾 Caché guardado exitosamente en {self.cache_path} ({len(snapshot)} archivos indexados)")
            return True
        except Exception as e:
            logger.error(f"❌ Error guardando caché: {e}")
            return False
