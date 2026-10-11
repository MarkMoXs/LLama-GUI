"""Routes for native file selection."""

from pathlib import Path
import sys

from backend.http import sanitize_error
from backend.services import file_picker, llama_manager, model_dir


def select_file(request, response, ctx):
    body = request.body or {}
    try:
        title, initial_dir, filetypes = file_picker.get_select_file_options(
            ctx,
            body.get("purpose"),
            body.get("title"),
        )
        selected_path = file_picker.select_file_in_native_dialog(
            title=title,
            initial_dir=initial_dir,
            filetypes=filetypes,
        )
        response.json(
            {
                "selected": bool(selected_path),
                "path": selected_path,
            }
        )
    except file_picker.NativePickerUnavailableError as exc:
        response.error(str(exc), 503)
    except ValueError as exc:
        response.error(str(exc), 409)
    except Exception as exc:
        response.error(sanitize_error(exc, 500), 500)


def select_folder(request, response, ctx):
    body = request.body or {}
    default_title = "Select llama.cpp Executable Folder" if body.get("purpose") == "custom-backend" else "Select Models Folder"
    title = str(body.get("title") or default_title).strip() or default_title
    try:
        if body.get("purpose") == "custom-backend":
            backend = body.get("backend", "custom")
            if not llama_manager.is_custom_backend(backend):
                response.error("Unsupported custom backend", 400)
                return
            initial_dir = llama_manager.get_backend_bin_dir(ctx, backend)
            if not initial_dir.is_dir():
                initial_dir = ctx.paths.root
        else:
            info = model_dir.get_models_dir_info(ctx)
            initial_dir = Path(info["models_dir"]) if info["models_dir_available"] else ctx.paths.models.parent
        selected_path = file_picker.select_folder_in_native_dialog(
            title=title,
            initial_dir=initial_dir,
        )
        response.json({"selected": bool(selected_path), "path": selected_path})
    except file_picker.NativePickerUnavailableError as exc:
        response.error(str(exc), 503)
    except Exception as exc:
        print(f"[file_picker] folder selection failed: {exc}", file=sys.stderr)
        response.error(sanitize_error(exc, 500), 500)
