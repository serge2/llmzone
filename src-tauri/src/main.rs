// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // 1. Позволяем приложению использовать Wayland (это то, что вы закомментировали)
    // Мы ставим "wayland,x11", чтобы система сама выбрала лучший вариант
    std::env::set_var("GDK_BACKEND", "wayland,x11");

    // 2. Сбрасываем принудительную тему, чтобы не было конфликтов с заголовком
    std::env::remove_var("GTK_THEME");

    llmzone_lib::run()
}
