#!/usr/bin/env python3
"""Small Tkinter editor for the data directory.

The editor discovers roles, categories, and tag dimensions from manifest.json
and each role's tags.json. It intentionally has no project-specific IDs in
the UI code, so the same tool works after the data directory grows.
"""

from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path
from pathlib import PurePosixPath
from urllib.parse import urlsplit

try:
    from .validate_data import _pairs_without_duplicates, _validate_url, validate_data
except ImportError:
    from validate_data import _pairs_without_duplicates, _validate_url, validate_data


SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")


def _load_tkinter():
    global tk, filedialog, messagebox, ttk
    import tkinter as tk_module
    from tkinter import filedialog as filedialog_module
    from tkinter import messagebox as messagebox_module
    from tkinter import ttk as ttk_module

    tk = tk_module
    filedialog = filedialog_module
    messagebox = messagebox_module
    ttk = ttk_module


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_pairs_without_duplicates)


def dump_json(path: Path, value) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def tag_dimensions(tags):
    """Return ordered (dimension, [(local_id, label), ...]) pairs."""
    if not isinstance(tags, dict):
        return []
    dimensions = []
    for dimension, values in tags.items():
        if not isinstance(values, dict):
            dimensions.append((dimension, []))
            continue
        choices = []
        for local_id, label in values.items():
            try:
                number = int(local_id)
            except (TypeError, ValueError):
                continue
            choices.append((number, str(label)))
        choices.sort(key=lambda item: item[0])
        dimensions.append((dimension, choices))
    return dimensions


def tags_to_values(value, dimensions):
    """Convert array or object tags into one local id or None per dimension."""
    result = [None] * len(dimensions)
    if isinstance(value, list):
        for index, tag in enumerate(value[: len(result)]):
            if tag is None or isinstance(tag, bool):
                continue
            result[index] = tag if isinstance(tag, int) else None
        return result
    if isinstance(value, dict):
        for index, (dimension, choices) in enumerate(dimensions):
            tag = value.get(dimension)
            if tag is None or isinstance(tag, bool):
                continue
            valid_ids = {local_id for local_id, _ in choices}
            if isinstance(tag, int) and tag in valid_ids:
                result[index] = tag
            elif isinstance(tag, str):
                for local_id, label in choices:
                    if tag == label:
                        result[index] = local_id
                        break
    return result


def values_to_tags(values):
    """Convert editor values to the canonical dimension-ordered array form."""
    return [value if value is not None else None for value in values]


def normalize_image_url(value, root: Path | str) -> str:
    """Validate an image URL and store it in the compact owner/commit/path form."""
    value = str(value or "").strip()
    errors = []
    canonical = _validate_url(value, "图片 URL", Path(root).resolve(), errors)
    if errors:
        raise ValueError(errors[0])
    if canonical.startswith("assets/placeholders/"):
        return canonical

    parts = urlsplit(canonical).path.strip("/").split("/")
    if len(parts) < 5 or parts[2].lower() != "blob" or not parts[4]:
        raise ValueError("图片 URL 无法转换为紧凑格式")
    owner = parts[0].lower()
    commit = parts[3].lower()
    file_path = PurePosixPath("/".join(parts[4:])).as_posix()
    return f"{owner}/{commit}/{file_path}"


def migrate_entry_tags(entries, old_dimensions, new_dimensions, renamed=None, fill_new=False):
    """Keep entry tags aligned when a role's tag dimensions are edited."""
    old_names = [dimension for dimension, _ in old_dimensions]
    new_names = [dimension for dimension, _ in new_dimensions]
    renamed = renamed or {}
    reverse_renamed = {new: old for old, new in renamed.items()}
    new_dimension_names = set(new_names) - set(old_names)
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        value = entry.get("tags")
        if isinstance(value, list):
            old_values = {
                name: value[index] if index < len(value) else None
                for index, name in enumerate(old_names)
            }
            entry["tags"] = [old_values.get(reverse_renamed.get(name, name)) for name in new_names]
        elif isinstance(value, dict):
            migrated = {}
            for name, tag in value.items():
                new_name = renamed.get(name, name)
                if new_name in new_names:
                    migrated[new_name] = tag
            if fill_new:
                for name in new_dimension_names:
                    if name not in migrated:
                        migrated[name] = None
            entry["tags"] = migrated


def tag_summary(value, dimensions):
    selected = tags_to_values(value, dimensions)
    parts = []
    for selected_id, (dimension, choices) in zip(selected, dimensions):
        label = "未知"
        for local_id, choice_label in choices:
            if selected_id == local_id:
                label = choice_label
                break
        parts.append(f"{dimension}: {label}")
    return "；".join(parts)


class DataEditor:
    def __init__(self, root, data_dir: Path | None = None):
        self.root = root
        self.root.title("NaiLoong 数据编辑器")
        self.root.geometry("1120x720")
        self.root.minsize(900, 560)
        self.data_dir: Path | None = None
        self.manifest = []
        self.roles = {}
        self.role_options = {}
        self.categories = {}
        self.category_options = {}
        self.entries = []
        self.dimensions = []
        self.current_file: Path | None = None
        self.current_index: int | None = None
        self.tag_vars = []
        self.tags = {}
        self.selected_tag_dimension: str | None = None

        self.role_var = tk.StringVar()
        self.category_var = tk.StringVar()
        self.title_var = tk.StringVar()
        self.url_var = tk.StringVar()
        self.path_var = tk.StringVar(value="尚未选择 data 文件夹")
        self.info_var = tk.StringVar(value="请选择一个 data 文件夹开始编辑。")

        self.build_ui()
        if data_dir:
            self.load_directory(data_dir)
        else:
            self.root.after(150, self.choose_directory)

    def build_ui(self):
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(2, weight=1)

        top = ttk.Frame(self.root, padding=10)
        top.grid(row=0, column=0, sticky="ew")
        top.columnconfigure(1, weight=1)
        ttk.Button(top, text="选择 data 文件夹", command=self.choose_directory).grid(row=0, column=0, padx=(0, 8))
        ttk.Label(top, textvariable=self.path_var).grid(row=0, column=1, sticky="w")
        ttk.Button(top, text="管理角色", command=self.manage_roles).grid(row=0, column=2, padx=(8, 0))

        selectors = ttk.LabelFrame(self.root, text="选择要编辑的分类", padding=10)
        selectors.grid(row=1, column=0, sticky="ew", padx=10, pady=(0, 10))
        selectors.columnconfigure(1, weight=1)
        selectors.columnconfigure(3, weight=1)
        ttk.Label(selectors, text="角色").grid(row=0, column=0, padx=(0, 6))
        self.role_combo = ttk.Combobox(selectors, textvariable=self.role_var, state="readonly")
        self.role_combo.grid(row=0, column=1, sticky="ew", padx=(0, 18))
        self.role_combo.bind("<<ComboboxSelected>>", self.role_changed)
        ttk.Label(selectors, text="分类").grid(row=0, column=2, padx=(0, 6))
        self.category_combo = ttk.Combobox(selectors, textvariable=self.category_var, state="readonly")
        self.category_combo.grid(row=0, column=3, sticky="ew")
        self.category_combo.bind("<<ComboboxSelected>>", self.category_changed)
        ttk.Button(selectors, text="管理分类", command=self.manage_categories).grid(row=0, column=4, padx=(8, 0))
        ttk.Button(selectors, text="管理标签", command=self.manage_tags).grid(row=0, column=5, padx=(6, 0))

        main = ttk.Frame(self.root, padding=(10, 0, 10, 10))
        main.grid(row=2, column=0, sticky="nsew")
        main.columnconfigure(0, weight=3)
        main.columnconfigure(1, weight=2)
        main.rowconfigure(0, weight=1)

        list_frame = ttk.LabelFrame(main, text="分类中的表情记录", padding=8)
        list_frame.grid(row=0, column=0, sticky="nsew", padx=(0, 10))
        list_frame.columnconfigure(0, weight=1)
        list_frame.rowconfigure(0, weight=1)
        columns = ("number", "title", "url")
        self.tree = ttk.Treeview(list_frame, columns=columns, show="headings", selectmode="browse")
        self.tree.heading("number", text="#")
        self.tree.heading("title", text="标题")
        self.tree.heading("url", text="图片 URL")
        self.tree.column("number", width=45, stretch=False, anchor="center")
        self.tree.column("title", width=180)
        self.tree.column("url", width=460)
        self.tree.grid(row=0, column=0, sticky="nsew")
        scrollbar = ttk.Scrollbar(list_frame, orient="vertical", command=self.tree.yview)
        scrollbar.grid(row=0, column=1, sticky="ns")
        self.tree.configure(yscrollcommand=scrollbar.set)
        self.tree.bind("<<TreeviewSelect>>", self.entry_selected)
        list_buttons = ttk.Frame(list_frame)
        list_buttons.grid(row=1, column=0, columnspan=2, sticky="ew", pady=(8, 0))
        ttk.Button(list_buttons, text="新增记录", command=self.new_entry).pack(side="left")
        ttk.Button(list_buttons, text="删除选中", command=self.delete_entry).pack(side="left", padx=6)
        ttk.Button(list_buttons, text="重新加载", command=self.reload_category).pack(side="left")

        editor = ttk.LabelFrame(main, text="记录详情", padding=12)
        editor.grid(row=0, column=1, sticky="nsew")
        editor.columnconfigure(1, weight=1)
        editor.rowconfigure(4, weight=1)
        ttk.Label(editor, text="标题").grid(row=0, column=0, sticky="nw", padx=(0, 8), pady=4)
        ttk.Entry(editor, textvariable=self.title_var).grid(row=0, column=1, sticky="ew", pady=4)
        ttk.Label(editor, text="图片 URL").grid(row=1, column=0, sticky="nw", padx=(0, 8), pady=4)
        ttk.Entry(editor, textvariable=self.url_var).grid(row=1, column=1, sticky="ew", pady=4)
        ttk.Label(editor, text="标签").grid(row=2, column=0, sticky="nw", padx=(0, 8), pady=8)
        self.tags_frame = ttk.Frame(editor)
        self.tags_frame.grid(row=2, column=1, sticky="ew", pady=4)
        ttk.Label(editor, text="标签说明").grid(row=3, column=0, sticky="nw", padx=(0, 8), pady=8)
        self.tag_help = ttk.Label(editor, text="选择“未知”会写入 null。标签顺序由 tags.json 自动决定。", wraplength=330)
        self.tag_help.grid(row=3, column=1, sticky="w", pady=8)
        ttk.Label(editor, textvariable=self.info_var, foreground="#555", wraplength=380).grid(
            row=4, column=0, columnspan=2, sticky="nw", pady=(14, 8)
        )
        ttk.Button(editor, text="保存当前记录", command=self.save_entry).grid(
            row=5, column=0, columnspan=2, sticky="ew", pady=(8, 0)
        )

    def choose_directory(self):
        selected = filedialog.askdirectory(title="选择仓库中的 data 文件夹")
        if selected:
            self.load_directory(Path(selected))

    def load_directory(self, data_dir: Path):
        data_dir = data_dir.expanduser().resolve()
        manifest_path = data_dir / "manifest.json"
        if not data_dir.is_dir() or not manifest_path.is_file():
            messagebox.showerror("无法打开", "所选文件夹中没有 manifest.json，请选择仓库的 data 文件夹。")
            return
        try:
            manifest = load_json(manifest_path)
        except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
            messagebox.showerror("读取失败", f"manifest.json 无法读取：\n{exc}")
            return
        if not isinstance(manifest, list):
            messagebox.showerror("数据格式错误", "manifest.json 必须是数组。")
            return
        self.data_dir = data_dir
        self.manifest = manifest
        self.roles = {
            role.get("id"): role
            for role in manifest
            if isinstance(role, dict) and role.get("id")
        }
        self.path_var.set(str(data_dir))
        self.role_options = {
            self.item_label(role): role["id"]
            for role in self.roles.values()
        }
        role_labels = list(self.role_options)
        self.role_combo.configure(values=role_labels)
        if role_labels:
            self.role_var.set(role_labels[0])
            self.role_changed()
        self.info_var.set("已加载数据。先选择记录，或点击“新增记录”。")

    @staticmethod
    def item_label(item):
        identifier = str(item.get("id", ""))
        name = str(item.get("name", "")).strip()
        return f"{name} ({identifier})" if name and name != identifier else identifier

    def role_changed(self, _event=None):
        role_id = self.role_options.get(self.role_var.get(), self.role_var.get())
        role = self.roles.get(role_id, {})
        categories = role.get("subcategories", [])
        self.categories = {
            category.get("id"): category
            for category in categories
            if isinstance(category, dict) and category.get("id") and category.get("file")
        }
        self.category_options = {
            self.item_label(category): category["id"]
            for category in self.categories.values()
        }
        category_labels = list(self.category_options)
        self.category_combo.configure(values=category_labels)
        if category_labels:
            self.category_var.set(category_labels[0])
            self.category_changed()
        else:
            self.clear_editor()

    def category_changed(self, _event=None):
        self.reload_category()

    def current_role_id(self):
        return self.role_options.get(self.role_var.get(), self.role_var.get())

    def current_role(self):
        return self.roles.get(self.current_role_id(), {})

    def manifest_path(self):
        return self.data_dir / "manifest.json"

    def translations_path(self):
        return self.data_dir / "tag-translations.json"

    def snapshot_data_tree(self):
        return {
            path: path.read_bytes()
            for path in self.data_dir.rglob("*")
            if path.is_file()
        }

    def restore_data_tree(self, snapshot):
        for path in sorted(self.data_dir.rglob("*"), reverse=True):
            if path.is_file() and path not in snapshot:
                path.unlink()
        for path, content in snapshot.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)

    def apply_data_change(self, description, action):
        snapshot = self.snapshot_data_tree()
        try:
            action()
            errors = validate_data(self.data_dir.parent)
        except (OSError, UnicodeError, ValueError, json.JSONDecodeError) as exc:
            self.restore_data_tree(snapshot)
            self.load_directory(self.data_dir)
            messagebox.showerror("保存失败", f"{description}未保存：\n{exc}")
            return False
        if errors:
            self.restore_data_tree(snapshot)
            self.load_directory(self.data_dir)
            messagebox.showerror("数据校验失败", f"{description}未保存：\n\n" + "\n".join(errors[:15]))
            return False
        self.load_directory(self.data_dir)
        self.info_var.set(f"{description}，并通过完整数据校验。")
        return True

    def role_category_paths(self, role):
        paths = []
        for category in role.get("subcategories", []):
            if not isinstance(category, dict) or not category.get("file"):
                continue
            paths.append(self.data_dir / Path(*str(category["file"]).replace("\\", "/").split("/")))
        return paths

    def role_tags_path(self, role):
        relative = role.get("tags")
        if relative:
            return self.data_dir / Path(*str(relative).replace("\\", "/").split("/"))
        return self.data_dir / str(role.get("id")) / "tags.json"

    def manage_roles(self):
        if not self.data_dir:
            return
        window = tk.Toplevel(self.root)
        window.title("管理角色")
        window.geometry("720x420")
        window.transient(self.root)
        window.columnconfigure(0, weight=1)
        window.rowconfigure(0, weight=1)
        tree = ttk.Treeview(window, columns=("id", "name", "icon"), show="headings", selectmode="browse")
        for column, label, width in (
            ("id", "ID", 150),
            ("name", "名称", 220),
            ("icon", "图标名（icons.js）", 190),
        ):
            tree.heading(column, text=label)
            tree.column(column, width=width)
        tree.grid(row=0, column=0, columnspan=2, sticky="nsew", padx=10, pady=10)
        scrollbar = ttk.Scrollbar(window, orient="vertical", command=tree.yview)
        scrollbar.grid(row=0, column=2, sticky="ns", pady=10)
        tree.configure(yscrollcommand=scrollbar.set)

        def refresh():
            tree.delete(*tree.get_children())
            for index, role in enumerate(self.manifest):
                tree.insert("", "end", iid=str(index), values=(role.get("id", ""), role.get("name", ""), role.get("icon", "")))

        def selected_index():
            selection = tree.selection()
            return int(selection[0]) if selection else None

        buttons = ttk.Frame(window)
        buttons.grid(row=1, column=0, columnspan=3, sticky="ew", padx=10, pady=(0, 10))
        ttk.Button(buttons, text="新增角色", command=lambda: self.role_form(window, None, refresh)).pack(side="left")
        ttk.Button(buttons, text="编辑角色", command=lambda: self.role_form(window, selected_index(), refresh)).pack(side="left", padx=6)
        ttk.Button(buttons, text="删除角色", command=lambda: self.delete_role(selected_index(), refresh)).pack(side="left")
        refresh()

    def role_form(self, parent, index, refresh):
        role = dict(self.manifest[index]) if index is not None else None
        form = tk.Toplevel(parent)
        form.title("编辑角色" if role else "新增角色")
        form.transient(parent)
        form.grab_set()
        fields = {}
        labels = (("id", "角色 ID"), ("name", "名称"), ("icon", "图标名"), ("desc", "说明"))
        for row, (key, label) in enumerate(labels):
            ttk.Label(form, text=label).grid(row=row, column=0, sticky="w", padx=10, pady=6)
            variable = tk.StringVar(value=str((role or {}).get(key, "")))
            fields[key] = variable
            ttk.Entry(form, textvariable=variable, width=42).grid(row=row, column=1, sticky="ew", padx=(0, 10), pady=6)
        category_fields = {}
        if role is None:
            ttk.Label(form, text="首个分类 ID").grid(row=4, column=0, sticky="w", padx=10, pady=6)
            category_fields["id"] = tk.StringVar(value="static")
            ttk.Entry(form, textvariable=category_fields["id"], width=42).grid(row=4, column=1, sticky="ew", padx=(0, 10), pady=6)
            ttk.Label(form, text="首个分类名称").grid(row=5, column=0, sticky="w", padx=10, pady=6)
            category_fields["name"] = tk.StringVar(value="静态图")
            ttk.Entry(form, textvariable=category_fields["name"], width=42).grid(row=5, column=1, sticky="ew", padx=(0, 10), pady=6)

        def submit():
            role_id = fields["id"].get().strip()
            role_name = fields["name"].get().strip()
            if not SLUG.fullmatch(role_id) or not role_name:
                messagebox.showerror("填写错误", "角色 ID 必须是小写字母、数字和连字符，名称不能为空。", parent=form)
                return
            if index is None:
                category_id = category_fields["id"].get().strip()
                category_name = category_fields["name"].get().strip()
                if not SLUG.fullmatch(category_id) or not category_name:
                    messagebox.showerror("填写错误", "分类 ID 必须是小写字母、数字和连字符，名称不能为空。", parent=form)
                    return
                if any(item.get("id") == role_id for item in self.manifest):
                    messagebox.showerror("保存失败", "角色 ID 已存在。", parent=form)
                    return
                role_value = {"id": role_id, "name": role_name, "subcategories": [
                    {"id": category_id, "name": category_name, "file": f"{role_id}/{category_id}.json"}
                ]}
                for key in ("icon", "desc"):
                    if fields[key].get().strip():
                        role_value[key] = fields[key].get().strip()

                def add():
                    self.manifest.append(role_value)
                    role_dir = self.data_dir / role_id
                    role_dir.mkdir(parents=True, exist_ok=True)
                    dump_json(role_dir / f"{category_id}.json", [])
                    dump_json(role_dir / "tags.json", {})
                    dump_json(self.manifest_path(), self.manifest)

                if self.apply_data_change("新增角色", add):
                    refresh()
                    form.destroy()
                return

            old_id = role["id"]
            if any(item.get("id") == role_id and item.get("id") != old_id for item in self.manifest):
                messagebox.showerror("保存失败", "角色 ID 已存在。", parent=form)
                return

            def edit():
                target = self.manifest[index]
                target["id"] = role_id
                target["name"] = role_name
                for key in ("icon", "desc"):
                    value = fields[key].get().strip()
                    if value:
                        target[key] = value
                    else:
                        target.pop(key, None)
                if role_id != old_id:
                    old_dir = self.data_dir / old_id
                    new_dir = self.data_dir / role_id
                    if old_dir.exists():
                        old_dir.rename(new_dir)
                    for category in target.get("subcategories", []):
                        file_value = str(category.get("file", ""))
                        if file_value.startswith(old_id + "/"):
                            category["file"] = role_id + file_value[len(old_id):]
                    if target.get("tags") == old_id + "/tags.json":
                        target["tags"] = role_id + "/tags.json"
                dump_json(self.manifest_path(), self.manifest)

            if self.apply_data_change("修改角色", edit):
                refresh()
                form.destroy()

        ttk.Button(form, text="保存", command=submit).grid(row=6, column=0, columnspan=2, sticky="ew", padx=10, pady=10)
        form.columnconfigure(1, weight=1)

    def delete_role(self, index, refresh):
        if index is None:
            return
        role = self.manifest[index]
        if not messagebox.askyesno("确认删除", f"确定删除角色“{role.get('name', role.get('id'))}”及其数据文件吗？"):
            return

        def delete():
            role_dir = self.data_dir / str(role["id"])
            if role_dir.exists():
                shutil.rmtree(role_dir)
            self.manifest.pop(index)
            dump_json(self.manifest_path(), self.manifest)

        if self.apply_data_change("删除角色", delete):
            refresh()

    def manage_categories(self):
        if not self.data_dir or not self.current_role():
            return
        role = self.current_role()
        window = tk.Toplevel(self.root)
        window.title(f"管理分类：{role.get('name', role.get('id'))}")
        window.geometry("700x400")
        window.transient(self.root)
        window.columnconfigure(0, weight=1)
        window.rowconfigure(0, weight=1)
        tree = ttk.Treeview(window, columns=("id", "name", "file"), show="headings", selectmode="browse")
        for column, label, width in (("id", "ID", 140), ("name", "名称", 180), ("file", "数据文件", 300)):
            tree.heading(column, text=label)
            tree.column(column, width=width)
        tree.grid(row=0, column=0, columnspan=2, sticky="nsew", padx=10, pady=10)

        def refresh():
            tree.delete(*tree.get_children())
            for index, category in enumerate(role.get("subcategories", [])):
                tree.insert("", "end", iid=str(index), values=(category.get("id", ""), category.get("name", ""), category.get("file", "")))

        def selected_index():
            selection = tree.selection()
            return int(selection[0]) if selection else None

        buttons = ttk.Frame(window)
        buttons.grid(row=1, column=0, columnspan=2, sticky="ew", padx=10, pady=(0, 10))
        ttk.Button(buttons, text="新增分类", command=lambda: self.category_form(window, role, None, refresh)).pack(side="left")
        ttk.Button(buttons, text="编辑分类", command=lambda: self.category_form(window, role, selected_index(), refresh)).pack(side="left", padx=6)
        ttk.Button(buttons, text="删除分类", command=lambda: self.delete_category(role, selected_index(), refresh)).pack(side="left")
        refresh()

    def category_form(self, parent, role, index, refresh):
        category = dict(role["subcategories"][index]) if index is not None else None
        form = tk.Toplevel(parent)
        form.title("编辑分类" if category else "新增分类")
        form.transient(parent)
        form.grab_set()
        id_var = tk.StringVar(value=str((category or {}).get("id", "")))
        name_var = tk.StringVar(value=str((category or {}).get("name", "")))
        for row, (label, variable) in enumerate((("分类 ID", id_var), ("名称", name_var))):
            ttk.Label(form, text=label).grid(row=row, column=0, sticky="w", padx=10, pady=8)
            ttk.Entry(form, textvariable=variable, width=42).grid(row=row, column=1, padx=(0, 10), pady=8)

        def submit():
            category_id = id_var.get().strip()
            name = name_var.get().strip()
            if not SLUG.fullmatch(category_id) or not name:
                messagebox.showerror("填写错误", "分类 ID 必须是小写字母、数字和连字符，名称不能为空。", parent=form)
                return
            old_category_id = category.get("id") if category else None
            if any(
                item.get("id") == category_id and item.get("id") != old_category_id
                for item in role["subcategories"]
            ):
                messagebox.showerror("保存失败", "分类 ID 已存在。", parent=form)
                return
            if index is None:
                category_value = {"id": category_id, "name": name, "file": f"{role['id']}/{category_id}.json"}

                def add():
                    role["subcategories"].append(category_value)
                    path = self.data_dir / role["id"] / f"{category_id}.json"
                    path.parent.mkdir(parents=True, exist_ok=True)
                    dump_json(path, [])
                    dump_json(self.manifest_path(), self.manifest)

                if self.apply_data_change("新增分类", add):
                    refresh()
                    form.destroy()
            else:
                old_file = str(role["subcategories"][index].get("file", ""))
                old_path = self.data_dir / Path(*old_file.replace("\\", "/").split("/"))
                new_file = f"{role['id']}/{category_id}.json"

                def edit():
                    role["subcategories"][index]["id"] = category_id
                    role["subcategories"][index]["name"] = name
                    role["subcategories"][index]["file"] = new_file
                    new_path = self.data_dir / Path(*new_file.split("/"))
                    if old_path != new_path and old_path.is_file():
                        new_path.parent.mkdir(parents=True, exist_ok=True)
                        old_path.rename(new_path)
                    dump_json(self.manifest_path(), self.manifest)

                if self.apply_data_change("修改分类", edit):
                    refresh()
                    form.destroy()

        ttk.Button(form, text="保存", command=submit).grid(row=2, column=0, columnspan=2, sticky="ew", padx=10, pady=10)

    def delete_category(self, role, index, refresh):
        if index is None:
            return
        if len(role.get("subcategories", [])) <= 1:
            messagebox.showerror("无法删除", "每个角色至少需要保留一个分类。")
            return
        category = role["subcategories"][index]
        if not messagebox.askyesno("确认删除", f"确定删除分类“{category.get('name', category.get('id'))}”及其记录吗？"):
            return

        def delete():
            path = self.data_dir / Path(*str(category["file"]).replace("\\", "/").split("/"))
            if path.is_file():
                path.unlink()
            role["subcategories"].pop(index)
            dump_json(self.manifest_path(), self.manifest)

        if self.apply_data_change("删除分类", delete):
            refresh()

    def role_entry_files(self, role):
        return [
            self.data_dir / Path(*str(category["file"]).replace("\\", "/").split("/"))
            for category in role.get("subcategories", [])
            if isinstance(category, dict) and category.get("file")
        ]

    def role_entries(self, role):
        result = []
        for path in self.role_entry_files(role):
            entries = load_json(path)
            if not isinstance(entries, list):
                raise ValueError(f"{path.name} 必须是 JSON 数组")
            result.append((path, entries))
        return result

    def role_translations(self):
        path = self.translations_path()
        value = load_json(path) if path.is_file() else {}
        return value if isinstance(value, dict) else {}

    def manage_tags(self):
        if not self.data_dir or not self.current_role():
            return
        role = self.current_role()
        try:
            tags = load_json(self.role_tags_path(role))
            translations = self.role_translations()
        except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
            messagebox.showerror("读取失败", f"标签文件无法读取：\n{exc}")
            return
        if not isinstance(tags, dict):
            messagebox.showerror("数据格式错误", "角色 tags.json 必须是对象。")
            return

        window = tk.Toplevel(self.root)
        window.title(f"管理标签：{role.get('name', role.get('id'))}")
        window.geometry("920x540")
        window.transient(self.root)
        window.columnconfigure(0, weight=1)
        window.columnconfigure(1, weight=2)
        window.rowconfigure(0, weight=1)

        dimension_frame = ttk.LabelFrame(window, text="标签", padding=8)
        dimension_frame.grid(row=0, column=0, sticky="nsew", padx=(10, 5), pady=10)
        dimension_frame.columnconfigure(0, weight=1)
        dimension_frame.rowconfigure(0, weight=1)
        dimension_tree = ttk.Treeview(dimension_frame, columns=("id", "zh", "en"), show="headings", selectmode="browse")
        for column, label, width in (("id", "ID", 120), ("zh", "中文", 100), ("en", "英文", 120)):
            dimension_tree.heading(column, text=label)
            dimension_tree.column(column, width=width)
        dimension_tree.grid(row=0, column=0, sticky="nsew")

        value_frame = ttk.LabelFrame(window, text="标签的值", padding=8)
        value_frame.grid(row=0, column=1, sticky="nsew", padx=(5, 10), pady=10)
        value_frame.columnconfigure(0, weight=1)
        value_frame.rowconfigure(0, weight=1)
        value_tree = ttk.Treeview(value_frame, columns=("id", "label"), show="headings", selectmode="browse")
        value_tree.heading("id", text="本地序号")
        value_tree.heading("label", text="标签文字")
        value_tree.column("id", width=100)
        value_tree.column("label", width=300)
        value_tree.grid(row=0, column=0, sticky="nsew")

        selected_dimension = {"id": None}

        def refresh_values(_event=None):
            selection = dimension_tree.selection()
            selected_dimension["id"] = dimension_tree.item(selection[0], "values")[0] if selection else None
            value_tree.delete(*value_tree.get_children())
            if selected_dimension["id"] is None:
                return
            for local_id, label in tags.get(selected_dimension["id"], {}).items():
                value_tree.insert("", "end", iid=str(local_id), values=(local_id, label))

        def refresh_dimensions():
            dimension_tree.delete(*dimension_tree.get_children())
            for dimension in tags:
                names = translations.get(dimension, {})
                dimension_tree.insert(
                    "", "end", iid=dimension,
                    values=(dimension, names.get("zh", ""), names.get("en", "")),
                )
            refresh_values()

        dimension_tree.bind("<<TreeviewSelect>>", refresh_values)

        dimension_buttons = ttk.Frame(dimension_frame)
        dimension_buttons.grid(row=1, column=0, sticky="ew", pady=(8, 0))
        ttk.Button(dimension_buttons, text="新增标签", command=lambda: self.add_tag_dimension(role, tags, translations, refresh_dimensions)).pack(side="left")
        ttk.Button(dimension_buttons, text="重命名/翻译", command=lambda: self.rename_tag_dimension(role, tags, translations, selected_dimension["id"], refresh_dimensions)).pack(side="left", padx=5)

        ttk.Label(window, text="编辑器不提供删除标签或标签值的操作；新增标签会为该角色所有条目补入 null。", foreground="#555").grid(row=1, column=0, columnspan=2, sticky="w", padx=10, pady=(0, 10))
        refresh_dimensions()

    def add_tag_dimension(self, role, tags, translations, refresh):
        form = tk.Toplevel(self.root)
        form.title("新增标签")
        form.transient(self.root)
        form.grab_set()
        variables = {key: tk.StringVar() for key in ("id", "zh", "en")}
        for row, (key, label) in enumerate((("id", "标签 ID"), ("zh", "中文翻译"), ("en", "英文翻译"))):
            ttk.Label(form, text=label).grid(row=row, column=0, sticky="w", padx=10, pady=7)
            ttk.Entry(form, textvariable=variables[key], width=38).grid(row=row, column=1, padx=(0, 10), pady=7)

        def submit():
            dimension = variables["id"].get().strip()
            zh = variables["zh"].get().strip()
            en = variables["en"].get().strip()
            if not dimension or not zh or not en or dimension in tags:
                messagebox.showerror("填写错误", "标签 ID 必须唯一，ID 和中英文翻译都不能为空。", parent=form)
                return
            old_dimensions = tag_dimensions(tags)
            new_tags = dict(tags)
            new_tags[dimension] = {}
            new_dimensions = tag_dimensions(new_tags)

            def add():
                tags.clear()
                tags.update(new_tags)
                translations[dimension] = {"zh": zh, "en": en}
                for path, entries in self.role_entries(role):
                    migrate_entry_tags(entries, old_dimensions, new_dimensions, fill_new=True)
                    dump_json(path, entries)
                dump_json(self.role_tags_path(role), tags)
                dump_json(self.translations_path(), translations)

            if self.apply_data_change("新增标签", add):
                refresh()
                form.destroy()

        ttk.Button(form, text="保存", command=submit).grid(row=3, column=0, columnspan=2, sticky="ew", padx=10, pady=10)

    def rename_tag_dimension(self, role, tags, translations, dimension, refresh):
        if not dimension or dimension not in tags:
            messagebox.showinfo("没有选择", "请先选择一个标签。")
            return
        form = tk.Toplevel(self.root)
        form.title("重命名标签和翻译")
        form.transient(self.root)
        form.grab_set()
        names = translations.get(dimension, {})
        variables = {
            "id": tk.StringVar(value=dimension),
            "zh": tk.StringVar(value=str(names.get("zh", ""))),
            "en": tk.StringVar(value=str(names.get("en", ""))),
        }
        for row, (key, label) in enumerate((("id", "标签 ID"), ("zh", "中文翻译"), ("en", "英文翻译"))):
            ttk.Label(form, text=label).grid(row=row, column=0, sticky="w", padx=10, pady=7)
            ttk.Entry(form, textvariable=variables[key], width=38).grid(row=row, column=1, padx=(0, 10), pady=7)

        def submit():
            new_dimension = variables["id"].get().strip()
            zh = variables["zh"].get().strip()
            en = variables["en"].get().strip()
            if not new_dimension or not zh or not en or (new_dimension != dimension and new_dimension in tags):
                messagebox.showerror("填写错误", "标签 ID 必须唯一，ID 和中英文翻译都不能为空。", parent=form)
                return
            old_dimensions = tag_dimensions(tags)

            def edit():
                new_tags = {}
                for key, value in tags.items():
                    new_tags[new_dimension if key == dimension else key] = value
                tags.clear()
                tags.update(new_tags)
                new_translations = {}
                for key, value in translations.items():
                    if key != dimension:
                        new_translations[key] = value
                new_translations[new_dimension] = {"zh": zh, "en": en}
                translations.clear()
                translations.update(new_translations)
                new_dimensions = tag_dimensions(tags)
                for path, entries in self.role_entries(role):
                    migrate_entry_tags(entries, old_dimensions, new_dimensions, {dimension: new_dimension})
                    dump_json(path, entries)
                dump_json(self.role_tags_path(role), tags)
                dump_json(self.translations_path(), translations)

            if self.apply_data_change("修改标签", edit):
                refresh()
                form.destroy()

        ttk.Button(form, text="保存", command=submit).grid(row=3, column=0, columnspan=2, sticky="ew", padx=10, pady=10)

    def category_path(self):
        if not self.data_dir:
            return None
        category_id = self.category_options.get(self.category_var.get(), self.category_var.get())
        category = self.categories.get(category_id)
        if not category:
            return None
        return (self.data_dir / Path(*str(category["file"]).replace("\\", "/").split("/"))).resolve()

    def tags_path(self):
        role_id = self.role_options.get(self.role_var.get(), self.role_var.get())
        role = self.roles.get(role_id, {})
        relative = role.get("tags")
        if relative:
            return self.data_dir / Path(*str(relative).replace("\\", "/").split("/"))
        category_path = self.category_path()
        return category_path.parent / "tags.json" if category_path else None

    def reload_category(self):
        path = self.category_path()
        tag_path = self.tags_path()
        if not path or not tag_path:
            self.clear_editor()
            return
        try:
            entries = load_json(path)
            tags = load_json(tag_path)
        except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
            messagebox.showerror("读取失败", f"分类或 tags.json 无法读取：\n{exc}")
            return
        if not isinstance(entries, list):
            messagebox.showerror("数据格式错误", f"{path.name} 必须是数组。")
            return
        self.current_file = path
        self.entries = entries
        self.tags = tags if isinstance(tags, dict) else {}
        self.dimensions = tag_dimensions(tags)
        self.current_index = None
        self.refresh_tree()
        self.clear_editor()

    def refresh_tree(self):
        for item in self.tree.get_children():
            self.tree.delete(item)
        for index, entry in enumerate(self.entries):
            if not isinstance(entry, dict):
                entry = {}
            self.tree.insert(
                "", "end", iid=str(index),
                values=(index + 1, entry.get("title", ""), entry.get("url", "")),
            )

    def clear_editor(self):
        self.current_index = None
        self.title_var.set("")
        self.url_var.set("")
        for child in self.tags_frame.winfo_children():
            child.destroy()
        self.tag_vars = []

    def entry_selected(self, _event=None):
        selection = self.tree.selection()
        if not selection:
            return
        index = int(selection[0])
        self.show_entry(index)

    def show_entry(self, index):
        if index < 0 or index >= len(self.entries):
            return
        entry = self.entries[index] if isinstance(self.entries[index], dict) else {}
        self.current_index = index
        self.title_var.set(str(entry.get("title", "")))
        self.url_var.set(str(entry.get("url", "")))
        for child in self.tags_frame.winfo_children():
            child.destroy()
        self.tag_vars = []
        selected = tags_to_values(entry.get("tags"), self.dimensions)
        for index, ((dimension, choices), selected_id) in enumerate(zip(self.dimensions, selected)):
            variable = tk.StringVar()
            self.tag_vars.append(variable)
            values = ["未知"] + [f"{local_id}: {label}" for local_id, label in choices]
            current = "未知"
            for local_id, label in choices:
                if selected_id == local_id:
                    current = f"{local_id}: {label}"
                    break
            variable.set(current)
            ttk.Label(self.tags_frame, text=dimension).grid(row=index, column=0, sticky="w", padx=(0, 8), pady=3)
            ttk.Combobox(self.tags_frame, textvariable=variable, values=values, state="readonly", width=28).grid(
                row=index, column=1, sticky="ew", pady=3
            )

    def new_entry(self):
        if not self.current_file:
            return
        self.entries.append({"title": "", "url": "", "tags": [None] * len(self.dimensions)})
        self.refresh_tree()
        index = len(self.entries) - 1
        self.tree.selection_set(str(index))
        self.tree.focus(str(index))
        self.show_entry(index)
        self.title_var.set("")
        self.url_var.set("")
        self.info_var.set("正在编辑新记录。填写标题、固定 commit 的图片 URL 和标签后保存。")

    def selected_tag_values(self):
        values = []
        for variable, (_, choices) in zip(self.tag_vars, self.dimensions):
            selected = variable.get()
            if selected == "未知" or not selected:
                values.append(None)
                continue
            try:
                values.append(int(selected.split(":", 1)[0]))
            except (TypeError, ValueError):
                values.append(None)
        return values

    def save_entry(self):
        if self.current_file is None or self.current_index is None:
            messagebox.showinfo("没有选中记录", "请先选择一条记录，或点击“新增记录”。")
            return
        title = self.title_var.get().strip()
        url = self.url_var.get().strip()
        if not title or not url:
            messagebox.showerror("填写不完整", "标题和图片 URL 都不能为空。")
            return
        try:
            url = normalize_image_url(url, self.data_dir.parent)
        except ValueError as exc:
            messagebox.showerror("图片 URL 无效", str(exc))
            return
        old_bytes = self.current_file.read_bytes()
        updated_entry = dict(self.entries[self.current_index])
        updated_entry.update({
            "title": title,
            "url": url,
            "tags": values_to_tags(self.selected_tag_values()),
        })
        self.entries[self.current_index] = updated_entry
        try:
            dump_json(self.current_file, self.entries)
            errors = validate_data(self.data_dir.parent)
        except (OSError, UnicodeError) as exc:
            self.current_file.write_bytes(old_bytes)
            messagebox.showerror("保存失败", str(exc))
            return
        if errors:
            self.current_file.write_bytes(old_bytes)
            self.entries = load_json(self.current_file)
            self.refresh_tree()
            self.show_entry(self.current_index)
            messagebox.showerror("数据校验失败", "保存已撤销：\n\n" + "\n".join(errors[:12]))
            return
        self.refresh_tree()
        self.tree.selection_set(str(self.current_index))
        self.info_var.set(f"已保存 {self.current_file.relative_to(self.data_dir)}，并通过完整数据校验。")

    def delete_entry(self):
        if self.current_file is None or self.current_index is None:
            return
        if not messagebox.askyesno("确认删除", "确定删除当前记录吗？删除会立即写入分类文件。"):
            return
        old_bytes = self.current_file.read_bytes()
        deleted = self.entries.pop(self.current_index)
        try:
            dump_json(self.current_file, self.entries)
            errors = validate_data(self.data_dir.parent)
        except (OSError, UnicodeError) as exc:
            self.current_file.write_bytes(old_bytes)
            self.entries.insert(self.current_index, deleted)
            messagebox.showerror("删除失败", str(exc))
            return
        if errors:
            self.current_file.write_bytes(old_bytes)
            self.entries.insert(self.current_index, deleted)
            self.refresh_tree()
            messagebox.showerror("数据校验失败", "删除已撤销：\n\n" + "\n".join(errors[:12]))
            return
        self.refresh_tree()
        self.clear_editor()
        self.info_var.set("记录已删除，并通过完整数据校验。")


def main(argv=None) -> int:
    argv = argv or sys.argv[1:]
    data_dir = Path(argv[0]) if argv else None
    try:
        _load_tkinter()
    except ImportError:
        print(
            "打开编辑器需要 Tkinter 支持。在 Linux 系统上，请安装 python3-tk 软件包后重试。",
            file=sys.stderr,
        )
        return 1
    root = tk.Tk()
    DataEditor(root, data_dir)
    root.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
