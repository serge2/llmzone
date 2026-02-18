// src-tauri/src/lib.rs
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Runtime, State};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;

// Структура для хранения каналов отмены запросов
struct PendingRequests(Arc<Mutex<HashMap<String, oneshot::Sender<()>>>>);

#[derive(Deserialize)]
struct FetchPayload {
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: serde_json::Value,
}

#[derive(Serialize, Clone)]
struct StreamPayload {
    id: String,
    chunk: Option<String>,
    error: Option<String>,
    done: bool,
    status: Option<u16>, // ДОБАВЛЕНО: статус-код ответа
}

#[tauri::command(base_path = "core", rename_all = "camelCase")]
async fn stream_fetch<R: Runtime>(
    app: AppHandle<R>,
    request_id: String, 
    payload: FetchPayload,
    state: State<'_, PendingRequests>,
) -> Result<(), String> {
    let (cancel_tx, mut cancel_rx) = oneshot::channel();
    
    // Сохраняем канал отмены
    {
        // В Tauri 2.0 используем .inner() вместо .0
        let mut reqs = state.inner().0.lock().unwrap();
        reqs.insert(request_id.clone(), cancel_tx);
    }

    let client = reqwest::Client::new();
    let mut request_builder = client.request(
        reqwest::Method::from_bytes(payload.method.as_bytes()).map_err(|e| e.to_string())?,
        &payload.url,
    );

    for (key, value) in payload.headers {
        request_builder = request_builder.header(key, value);
    }

    let response = request_builder
        .json(&payload.body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    // ОТПРАВЛЯЕМ СТАТУС КОД перед началом стриминга чанков
    let status_code = response.status().as_u16();
    let _ = app.emit("stream-data", StreamPayload {
        id: request_id.clone(),
        chunk: None,
        error: None,
        done: false,
        status: Some(status_code),
    });

    let mut stream = response.bytes_stream();
    let id_for_event = request_id.clone();
    // В Tauri 2.0 используем .inner() для получения доступа к структуре данных
    let state_for_cleanup = state.inner().0.clone();

    tokio::spawn(async move {
        loop {
            tokio::select! {
                // Слушаем сигнал отмены
                _ = &mut cancel_rx => {
                    break;
                }
                // Читаем следующий чанк из сети
                item = stream.next() => {
                    match item {
                        Some(Ok(bytes)) => {
                            let text = String::from_utf8_lossy(&bytes).to_string();
                            let _ = app.emit("stream-data", StreamPayload {
                                id: id_for_event.clone(),
                                chunk: Some(text),
                                error: None,
                                done: false,
                                status: None,
                            });
                        }
                        Some(Err(e)) => {
                            let _ = app.emit("stream-data", StreamPayload {
                                id: id_for_event.clone(),
                                chunk: None,
                                error: Some(e.to_string()),
                                done: true,
                                status: None,
                            });
                            break;
                        }
                        // Явное указание Option::None, чтобы избежать ошибки non_snake_case
                        std::option::Option::None => {
                            let _ = app.emit("stream-data", StreamPayload {
                                id: id_for_event.clone(),
                                chunk: None,
                                error: None,
                                done: true,
                                status: None,
                            });
                            break;
                        }
                    }
                }
            }
        }
        // Удаляем запрос из списка активных после завершения
        let mut reqs = state_for_cleanup.lock().unwrap();
        reqs.remove(&id_for_event);
    });

    Ok(())
}

#[tauri::command(base_path = "core", rename_all = "camelCase")]
fn abort_stream(request_id: String, state: State<'_, PendingRequests>) {
    // В Tauri 2.0 используем .inner() вместо .0
    let mut reqs = state.inner().0.lock().unwrap();
    if let Some(tx) = reqs.remove(&request_id) {
        let _ = tx.send(()); 
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PendingRequests(Arc::new(Mutex::new(HashMap::new())))) 
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![stream_fetch, abort_stream])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
