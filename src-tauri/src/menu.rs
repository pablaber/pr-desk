use tauri::{
    menu::{Menu, MenuEvent, MenuItem},
    AppHandle, Emitter, Runtime,
};

/// The menu item id and the event the frontend listens for; it only asks the update service to
/// check, so it is not a bridge command.
const CHECK_FOR_UPDATES: &str = "check-for-updates";

/// Tauri's default menu, with Check for Updates… directly after About PR Desk.
pub fn app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app)?;
    let items = menu.items()?;
    if let Some(app_submenu) = items.first().and_then(|item| item.as_submenu()) {
        let check = MenuItem::with_id(
            app,
            CHECK_FOR_UPDATES,
            "Check for Updates…",
            true,
            None::<&str>,
        )?;
        // The default app submenu already has a separator after About, so it now follows this item.
        app_submenu.insert(&check, 1)?;
    }
    Ok(menu)
}

pub fn on_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    if event.id() == CHECK_FOR_UPDATES {
        if let Err(error) = app.emit(CHECK_FOR_UPDATES, ()) {
            eprintln!("Could not request an update check: {error}");
        }
    }
}
