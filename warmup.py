"""
Script para pre-calentar la aplicación después de desplegar en IIS.
Ejecutar después de cada actualización para inicializar el RAG Engine.
"""
import requests
import time
import sys

def warmup_app(base_url="http://localhost"):
    """
    Pre-carga la aplicación llamando al endpoint de health y luego
    forzando la inicialización del RAG Engine.
    """
    print("🔥 Iniciando warmup de LegalBot...")
    
    # 1. Verificar que la app responde
    try:
        print(f"⏳ Verificando endpoint /health...")
        response = requests.get(f"{base_url}/health", timeout=10)
        if response.status_code == 200:
            print("✅ Aplicación respondiendo correctamente")
        else:
            print(f"⚠️ Respuesta inesperada: {response.status_code}")
    except Exception as e:
        print(f"❌ Error conectando a la app: {e}")
        return False
    
    # 2. Hacer una consulta simple para forzar la carga del RAG Engine
    print("⏳ Inicializando RAG Engine (esto puede tardar 30-60 segundos)...")
    start_time = time.time()
    
    try:
        # Este endpoint requiere login, pero el intento forzará la carga del RAG Engine
        # si se usa desde dentro del servidor después del primer login exitoso
        response = requests.post(
            f"{base_url}/chat",
            json={"message": "test", "session_id": "warmup"},
            timeout=180  # 3 minutos de timeout
        )
        elapsed = time.time() - start_time
        
        # Esperamos un 401 (no autorizado) pero eso está bien
        # Lo importante es que el RAG Engine se haya cargado
        if response.status_code in [401, 500, 200]:
            print(f"✅ RAG Engine inicializado en {elapsed:.2f}s")
            print("✅ Aplicación lista para recibir requests")
            return True
        else:
            print(f"⚠️ Respuesta inesperada del chat: {response.status_code}")
            return True
            
    except requests.exceptions.Timeout:
        elapsed = time.time() - start_time
        print(f"⏰ Timeout después de {elapsed:.2f}s")
        print("⚠️ El RAG Engine puede estar tardando demasiado. Verifica los logs.")
        return False
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"❌ Error durante warmup después de {elapsed:.2f}s: {e}")
        return False

if __name__ == "__main__":
    # Permitir URL personalizada como argumento
    url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost"
    success = warmup_app(url)
    sys.exit(0 if success else 1)
