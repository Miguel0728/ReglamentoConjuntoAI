import os, logging, json, uuid
from flask import Flask, render_template, request, jsonify, session
from dotenv import load_dotenv
load_dotenv()

log_format = '%(asctime)s - %(levelname)s - [%(name)s] - %(message)s'
logging.basicConfig(level=logging.INFO, format=log_format, handlers=[logging.StreamHandler()])

from rag_engine import RAGEngine

logger = logging.getLogger(__name__)

_rag_engine_instance = None

def get_rag_engine():
    global _rag_engine_instance
    if _rag_engine_instance is None:
        logger.info("🔄 Inicializando RAG Engine...")
        _rag_engine_instance = RAGEngine()
        logger.info("✅ RAG Engine inicializado")
    return _rag_engine_instance

def init_app():
    app = Flask(__name__)
    app.secret_key = os.getenv('SECRET_KEY', 'legalbot_2025')

    @app.route('/health')
    def health():
        return jsonify({"status": "ok", "service": "legalbot"}), 200

    @app.route('/')
    def index():
        return render_template('index.html', username='Usuario')

    @app.route('/chat', methods=['POST'])
    def chat():
        data = request.json
        msg = data.get('message')
        sid = data.get('session_id') or str(uuid.uuid4())
        filtro = data.get('reglamento', 'todos')
        logger.info(f"📩 /chat - Filtro: {filtro} | MSG: {msg[:30]}...")

        all_sessions = session.setdefault('chat_history', {})
        history = all_sessions.get(sid, [])[-8:]

        try:
            engine = get_rag_engine()
            gen = engine.get_response(msg, history, filtro_usuario=filtro)

            # Guardar el mensaje del usuario ANTES de iniciar el stream
            all_sessions.setdefault(sid, [])
            all_sessions[sid].append({"role": "user", "content": msg})
            if len(all_sessions[sid]) > 40:
                all_sessions[sid] = all_sessions[sid][-40:]
            session.modified = True

            from flask import Response, stream_with_context

            @stream_with_context
            def generate():
                full_response = []
                for item in gen:
                    if "error" in item:
                        yield f"data: {json.dumps({'error': item['error']})}\n\n"
                        return
                    token = item.get("token", "")
                    if token:
                        full_response.append(token)
                        yield f"data: {json.dumps({'content': token})}\n\n"
                    if item.get("done"):
                        # Guardar respuesta del asistente al finalizar
                        final_text = "".join(full_response)
                        all_sessions[sid].append({"role": "assistant", "content": final_text})
                        if len(all_sessions[sid]) > 40:
                            all_sessions[sid] = all_sessions[sid][-40:]
                        session.modified = True
                        refs = item.get("refs", [])
                        yield f"data: {json.dumps({'done': True, 'session_id': sid, 'refs': refs})}\n\n"

            return Response(generate(), mimetype='text/event-stream')

        except Exception as e:
            logger.error(f"Error en /chat: {e}", exc_info=True)
            return jsonify({"error": f"Error interno: {str(e)}"}), 500

    @app.route('/api/sesiones')
    def get_sessions():
        all_sessions = session.get('chat_history', {})
        result = []
        for sid, msgs in all_sessions.items():
            titulo = next((m['content'][:50] for m in msgs if m['role'] == 'user'), 'Nueva')
            result.append({"session_id": sid, "titulo": titulo, "ultima_actualizacion": ""})
        return jsonify({"success": True, "sesiones": result})

    @app.route('/api/historial/<sid>')
    def get_historial(sid):
        msgs = session.get('chat_history', {}).get(sid, [])
        return jsonify({"success": True, "mensajes": [
            {"id": i, "role": m["role"], "message": m["content"], "timestamp": "", "referencias": []}
            for i, m in enumerate(msgs)
        ]})

    @app.route('/api/historial/<sid>', methods=['DELETE'])
    def delete_historial(sid):
        session.get('chat_history', {}).pop(sid, None)
        session.modified = True
        return jsonify({"success": True})

    return app

app = init_app()
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.getenv('PORT', 8000)), debug=True)
