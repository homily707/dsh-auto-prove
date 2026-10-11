/**
 * Browser half of `dsh-auto-prove` — the "自动允许" settings section and the
 * permission-surface shield icon.
 *
 * The judge provider, model, effort, and timeout are staged locally through the settings
 * scope so the Host stays the single authority on what was accepted.
 *
 * @module dsh-auto-prove/client
 */
window.__ModuleLoader__.load({
	id: "dsh-auto-prove",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		const React = react.default ?? react;
		const { SettingsFormModel } = require("@deepseek-ai/dsh-client-ui-primitives");

		const NAMESPACE = "auto-prove";
		const PACKAGE = "dsh-auto-prove";
		const LEGACY_PROVIDER = "__legacy__";

		const TEXT_FIELDS = ["judgeProvider", "judgeModel", "judgeEffort"];
		const NUMBER_FIELDS = ["judgeTimeoutMs"];
		const ALL_FIELDS = [...TEXT_FIELDS, ...NUMBER_FIELDS];

		const LABELS = {
			judgeProvider: "判断 Provider",
			judgeModel: "判定模型",
			judgeEffort: "思考强度（effort）",
			judgeTimeoutMs: "判定超时（毫秒）",
		};

		const HINTS = {
			judgeProvider: "复用已有提供商的 API 地址和密钥。未选择时回落人工确认。",
			judgeModel: "选择该提供商的模型；切换提供商后需重新选择。",
			judgeEffort: "手动填写 low、high、max 等接口支持的值；off 或 none 关闭思考，留空不发送思考参数。",
			judgeTimeoutMs: "判定超时（毫秒）；超时或失败时回退到人工确认。",
		};

		// ---- styles ----
		const css = ".dshap_card{display:flex;flex-direction:column;gap:2px;padding:14px 16px;border:1px solid var(--dsw-alias-border-l2,#e5e5e5);border-radius:12px;background:var(--dsw-alias-bg-layer-2,#fff);max-width:720px}.dshap_title{margin:0;font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary,#171717)}.dshap_desc{margin:0 0 6px;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary,#8f8f8f)}.dshap_field{display:flex;flex-direction:column;gap:5px;padding:10px 0;border-top:1px solid var(--dsw-alias-border-l2,#efefef)}.dshap_head{display:flex;align-items:center;gap:8px}.dshap_label{flex:1;min-width:0;font-size:13px;font-weight:500;line-height:1.5;color:var(--dsw-alias-label-primary,#171717)}.dshap_badge{flex:none;padding:1px 8px;border-radius:999px;font-size:11px;line-height:17px;white-space:nowrap;color:var(--dsw-alias-label-secondary,#5f5f5f);background:var(--dsw-alias-bg-module-platform,#f2f2f2)}.dshap_reset{padding:0;border:none;background:none;font:inherit;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-secondary,#5f5f5f);cursor:pointer}.dshap_reset:hover:not(:disabled){color:var(--dsw-alias-label-primary,#171717)}.dshap_reset:disabled,.dshap_input:disabled{cursor:default;color:var(--dsw-alias-label-tertiary,#a3a3a3)}.dshap_input{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,#e5e5e5);border-radius:8px;background:var(--dsw-alias-bg-layer-3,#fafafa);color:var(--dsw-alias-label-primary,#171717);font:inherit;font-size:13px;line-height:1.5;padding:0 12px;height:34px}.dshap_input:focus-visible{border-color:var(--dsw-alias-brand-primary,#1650ff);outline:none}.dshap_input[data-invalid=true]{border-color:var(--dsw-alias-label-error,#e5484d)}.dshap_hint{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#8f8f8f)}.dshap_actions{display:flex;align-items:center;gap:10px;padding-top:12px}.dshap_state{flex:1;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#8f8f8f)}.dshap_btn{height:32px;padding:0 14px;border:none;border-radius:8px;font:inherit;font-size:13px;line-height:30px;cursor:pointer}.dshap_btnSave{background:var(--dsw-alias-state-business-primary,#1650ff);color:#fff}.dshap_btnSave:disabled{opacity:.5;cursor:default}.dshap_btnDiscard{background:none;color:var(--dsw-alias-label-secondary,#5f5f5f)}.dshap_btnDiscard:disabled{opacity:.5;cursor:default}";

		// ---- permission-surface shield icon (visual asset reused from dsh-auto-mode) ----
		// auto-mode actively strips its own icon attribute from non-Auto rows and
		// client bundles may not import across plugins, so the SVG is copied here.
		const ICON_ATTRIBUTE = "data-dsh-auto-prove-icon";
		const PROVE_LABEL = "自动允许";
		const PERMISSION_LABEL_SETS = [
			["Read Only", "Workspace Write", "Full access"],
			["仅可查看", "工作区内修改", "完全权限"],
		];
		const ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M8.21.9l6.58 2.47v3.64c0 4.99-3.74 7.2-6.58 8.29C5.36 14.21 1.62 12 1.62 7.01V3.37L8.21.9Z" fill="none" stroke="black" stroke-width="1.32" stroke-linejoin="round"/><path d="M8.75 3.65 5.95 8.2h2.08l-.78 4.15 2.82-4.9H8.12l.63-3.8Z" fill="black"/></svg>';
		const iconCss = (() => {
			const mask = 'url("data:image/svg+xml,' + encodeURIComponent(ICON_SVG) + '")';
			return "[" + ICON_ATTRIBUTE + "]::before{content:\"\";display:inline-block;flex:0 0 auto;width:16px;height:16px;background-color:var(--dsw-alias-label-tertiary,currentColor);-webkit-mask-image:" + mask + ";mask-image:" + mask + ";-webkit-mask-position:center;mask-position:center;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-size:contain;mask-size:contain}"
				+ "[" + ICON_ATTRIBUTE + "=trigger]::before{width:14px;height:14px}"
				+ "@container (max-width:460px){[" + ICON_ATTRIBUTE + "=trigger]>span:first-of-type{display:none}}";
		})();

		const cssTagId = PACKAGE + "/settings.css";
		function installStyles() {
			let tag = document.querySelector("style[data-plugin-css=" + JSON.stringify(cssTagId) + "]");
			if (tag === null) {
				tag = document.createElement("style");
				tag.dataset.plugin = PACKAGE;
				tag.dataset.pluginCss = cssTagId;
				document.head.appendChild(tag);
			}
			tag.textContent = css + iconCss;
			return () => { tag.remove() };
		}

		const normalizedText = (element) => (element.textContent ?? "").replace(/\s+/g, " ").trim();
		const isProveLabel = (element) => normalizedText(element) === PROVE_LABEL;

		function isPermissionMenu(menu) {
			const labels = new Set(Array.from(menu.querySelectorAll('button[role="menuitem"]'), normalizedText));
			return PERMISSION_LABEL_SETS.some((required) => required.every((label) => labels.has(label)));
		}

		function isProveMenuItem(element) {
			if (!element.matches('button[role="menuitem"]') || !isProveLabel(element)) return false;
			const menu = element.closest('[role="menu"]');
			return menu !== null && isPermissionMenu(menu);
		}

		function isProvePermissionOption(element) {
			if (!element.matches('[role="option"]')) return false;
			const label = (element.closest('[role="listbox"][aria-label]')?.getAttribute("aria-label") ?? "").trim();
			return /^\/permission\s+(?:matches|匹配项)$/i.test(label) && isProveLabel(element.firstElementChild ?? element);
		}

		function isProveTrigger(element) {
			if (!element.matches("button[aria-label]")) return false;
			const label = (element.getAttribute("aria-label") ?? "").trimEnd();
			return /(?:访问模式|Access mode)/i.test(label) && label.endsWith(PROVE_LABEL);
		}

		function hasPermissionTitle(element) {
			return Array.from(element.querySelectorAll("div"))
				.some((child) => ["Permission", "权限"].includes(normalizedText(child)));
		}

		function isProveSettingsTrigger(element) {
			if (!element.matches('button[aria-haspopup="menu"]') || !isProveLabel(element)) return false;
			let ancestor = element.parentElement;
			for (let depth = 0; ancestor !== null && depth < 4; depth += 1, ancestor = ancestor.parentElement) {
				if (hasPermissionTitle(ancestor)) return true;
				if (ancestor.matches('[role="dialog"]')) return false;
			}
			return false;
		}

		function decorateProveIcons(doc) {
			for (const marked of doc.querySelectorAll("[" + ICON_ATTRIBUTE + "]")) {
				const kind = marked.getAttribute(ICON_ATTRIBUTE);
				const valid = (kind === "menu" && isProveMenuItem(marked))
					|| (kind === "trigger" && isProveTrigger(marked))
					|| (kind === "settings" && isProveSettingsTrigger(marked))
					|| (kind === "option" && isProvePermissionOption(marked));
				if (!valid) marked.removeAttribute(ICON_ATTRIBUTE);
			}
			for (const element of doc.querySelectorAll('button[role="menuitem"], button[aria-label], button[aria-haspopup="menu"], [role="option"]')) {
				const kind = isProveMenuItem(element) ? "menu"
					: isProveTrigger(element) ? "trigger"
					: isProveSettingsTrigger(element) ? "settings"
					: isProvePermissionOption(element) ? "option" : "";
				if (kind !== "") element.setAttribute(ICON_ATTRIBUTE, kind);
			}
		}

		function observeProveIcons() {
			let queued = false;
			let disposed = false;
			const scan = () => {
				if (queued || disposed) return;
				queued = true;
				queueMicrotask(() => {
					queued = false;
					if (!disposed) decorateProveIcons(document);
				});
			};
			scan();
			const observer = new MutationObserver(scan);
			observer.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ["aria-label"],
				characterData: true,
				childList: true,
				subtree: true,
			});
			return () => {
				disposed = true;
				observer.disconnect();
				for (const element of document.querySelectorAll("[" + ICON_ATTRIBUTE + "]")) element.removeAttribute(ICON_ATTRIBUTE);
			};
		}

		// ---- controller ----
		// Empty is an explicit value; only resetField removes the user override.
		const textField = (field) => ({
			field,
			format: (value) => typeof value === "string" ? value : "",
			parse: (text) => ({ kind: "set", value: text.trim() }),
		});
		const timeoutField = (field) => ({
			field,
			format: (value) => typeof value === "number" ? String(value) : "",
			parse: (text) => {
				const trimmed = text.trim();
				if (trimmed === "") return { kind: "clear" };
				const parsed = Number(trimmed);
				return Number.isInteger(parsed) && parsed >= 1000 && parsed <= 2147483647 ? { kind: "set", value: parsed } : undefined;
			},
		});

		class AutoProveCardController {
			constructor(scope) {
				this.form = new SettingsFormModel(scope, [
					...TEXT_FIELDS.map(textField),
					...NUMBER_FIELDS.map(timeoutField),
				]);
				this.store = this.form.bind(() => this.projection());
			}

			projection() {
				return {
					...this.form.shell(),
					fields: Object.fromEntries(ALL_FIELDS.map((field) => [field, this.form.field(field)])),
				};
			}

			inject() {
				const actions = this.form.actions();
				return {
					hooks: { autoProveCard: this.store },
					...actions,
					edit: (field, text) => {
						if (field === "judgeProvider" && text !== this.form.field(field).text) actions.edit("judgeModel", "");
						actions.edit(field, text);
					},
					resetField: (field) => {
						const before = this.form.field("judgeProvider").text;
						actions.resetField(field);
						if (field === "judgeProvider" && before !== this.form.field(field).text) actions.edit("judgeModel", "");
					},
				};
			}

			dispose() {
				this.form.dispose();
			}
		}

		// ---- section component ----
		function Section(props) {
			const state = props.useAutoProveCard((snapshot) => snapshot);
			const disabled = !state.writable || state.saving;
			const [catalog, setCatalog] = React.useState({ loading: true, providers: [], error: "" });
			const [revision, refresh] = React.useReducer((value) => value + 1, 0);
			React.useEffect(() => {
				const controller = new AbortController();
				setCatalog((current) => ({ ...current, loading: true, error: "" }));
				void (async () => {
					try {
						const response = await fetch("/auto-prove/providers", { signal: controller.signal, cache: "no-store" });
						const providers = await response.json();
						if (!response.ok || !Array.isArray(providers)) throw new Error("无法读取提供商列表，请刷新重试。");
						if (!controller.signal.aborted) setCatalog({ loading: false, providers, error: "" });
					} catch (error) {
						if (!controller.signal.aborted) setCatalog({ loading: false, providers: [], error: error.message });
					}
				})();
				return () => controller.abort();
			}, [revision]);
			const providerId = state.fields.judgeProvider.text;
			const modelId = state.fields.judgeModel.text;
			const legacy = providerId === LEGACY_PROVIDER;
			const provider = catalog.providers.find((entry) => entry.id === providerId);
			const modelKnown = provider?.models.some((entry) => entry.id === modelId);
			const selectionInvalid = providerId !== "" && !legacy && (catalog.loading || !!catalog.error || !provider || !!provider.unavailableReason || !modelKnown);

			const children = [
				React.createElement("h3", { key: "title", className: "dshap_title" }, "自动允许"),
				React.createElement("p", { key: "desc", className: "dshap_desc" },
					"权限模式：Workspace Write 基础上，每次需要人工确认的请求先发给 LLM 判定（复用 auto-review 审查逻辑，直连 OpenAI 兼容端点 + JSON mode）；allow 自动放行、deny 直接拒绝、判定失败或超时回落到人工。"),
			];
			if (!state.available) {
				children.push(React.createElement("p", { key: "unavailable", className: "dshap_hint" }, "设置服务不可用。"));
				return React.createElement("div", { className: "dshap_card" }, children);
			}
			children.push(React.createElement("div", { key: "catalog", className: "dshap_actions" }, [
				React.createElement("span", { key: "status", className: "dshap_hint", role: "status" },
					catalog.loading ? "正在读取提供商…" : catalog.error || (catalog.providers.length ? "" : "暂无已配置的提供商。")),
				React.createElement("button", { key: "refresh", type: "button", className: "dshap_btn", disabled: catalog.loading, onClick: refresh }, "刷新列表"),
			]));
			if (legacy) children.push(React.createElement("p", { key: "legacy", className: "dshap_hint" },
				"尚未选择提供商；已有旧端点配置会继续使用。选择提供商和模型并保存后完成迁移。"));
			for (const field of ALL_FIELDS) {
				const fieldState = state.fields[field];
				const invalid = fieldState.invalid || (field === "judgeProvider" && providerId !== "" && !legacy && !catalog.loading && !provider)
					|| (field === "judgeModel" && providerId !== "" && !legacy && !catalog.loading && !modelKnown);
				const overridden = fieldState.overridden;
				const head = [
					React.createElement("span", { key: "label", className: "dshap_label" }, LABELS[field] ?? field),
				];
				if (overridden) head.push(React.createElement("span", { key: "badge", className: "dshap_badge" }, "已覆盖"));
				if (overridden) head.push(React.createElement("button", {
					key: "reset", type: "button", className: "dshap_reset", disabled,
					onClick: () => { props.resetField(field) },
				}, "恢复默认"));
				const fieldChildren = [React.createElement("div", { key: "head", className: "dshap_head" }, head)];
				const control = {
					key: "input", className: "dshap_input", disabled,
					value: fieldState.text, "data-invalid": invalid, "aria-invalid": invalid, "aria-label": LABELS[field],
					onChange: (event) => { props.edit(field, event.target.value) },
				};
				if (field === "judgeProvider") {
					const choices = [React.createElement("option", { key: "", value: "" }, "未选择（人工确认）")];
					if (legacy) choices.push(React.createElement("option", { key: LEGACY_PROVIDER, value: LEGACY_PROVIDER }, "尚未迁移（沿用旧配置）"));
					if (providerId && !legacy && !provider) choices.push(React.createElement("option", { key: providerId, value: providerId, disabled: true }, `${providerId}（不可用）`));
					for (const entry of catalog.providers) choices.push(React.createElement("option", {
						key: entry.id, value: entry.id, disabled: !!entry.unavailableReason,
					}, `${entry.name} (${entry.id})${entry.unavailableReason ? ` — ${entry.unavailableReason}` : ""}`));
					fieldChildren.push(React.createElement("select", { ...control, disabled: disabled || catalog.loading }, choices));
					if (provider?.unavailableReason) fieldChildren.push(React.createElement("p", { key: "reason", className: "dshap_hint" }, provider.unavailableReason));
				} else if (field === "judgeModel") {
					const choices = [React.createElement("option", { key: "", value: "" }, "请选择模型")];
					if (modelId && !modelKnown) choices.push(React.createElement("option", { key: modelId, value: modelId, disabled: true }, `${modelId}${legacy ? "（旧配置）" : "（不可用）"}`));
					for (const entry of provider?.models ?? []) choices.push(React.createElement("option", { key: entry.id, value: entry.id }, `${entry.name} (${entry.id})`));
					fieldChildren.push(React.createElement("select", { ...control, disabled: disabled || catalog.loading || !provider || !!provider.unavailableReason }, choices));
				} else {
					fieldChildren.push(React.createElement("input", { ...control, type: "text", spellCheck: false,
						inputMode: NUMBER_FIELDS.includes(field) ? "numeric" : "text", placeholder: field === "judgeEffort" ? "low / high / off" : undefined }));
				}
				if (invalid) fieldChildren.push(React.createElement("p", { key: "invalid", className: "dshap_hint" },
					NUMBER_FIELDS.includes(field) ? "请填 1000–2147483647 之间的整数毫秒数。" : "内容无效。"));
				fieldChildren.push(React.createElement("p", { key: "hint", className: "dshap_hint" }, HINTS[field] ?? ""));
				children.push(React.createElement("div", { key: field, className: "dshap_field" }, fieldChildren));
			}
			children.push(React.createElement("div", { key: "actions", className: "dshap_actions" }, [
				React.createElement("span", { key: "state", className: "dshap_state" },
					state.failed ? "设置保存被拒绝，已保留草稿。" : state.saving ? "保存中…" : ""),
				React.createElement("button", {
					key: "discard", type: "button", className: "dshap_btn dshap_btnDiscard",
					disabled: disabled || !state.dirty,
					onClick: () => { props.discard() },
				}, "放弃修改"),
				React.createElement("button", {
					key: "save", type: "button", className: "dshap_btn dshap_btnSave",
					disabled: disabled || !state.dirty || state.invalid || selectionInvalid,
					onClick: () => { props.save() },
				}, "保存"),
			]));
			return React.createElement("div", { className: "dshap_card" }, children);
		}

		const inject = ["slots", "configForms"];

		function apply(ctx) {
			if (typeof document !== "undefined") {
				ctx.effect(installStyles);
				ctx.effect(observeProveIcons);
			}
			const slots = ctx.get("slots");
			const configForms = ctx.get("configForms");
			if (slots === undefined || configForms === undefined) return;
			// The Loader row id names the settings namespace. ConfigForms owns
			// this shared form; the card only owns its subscription.
			const scope = configForms.get(NAMESPACE);
			ctx.effect(() => {
				const controller = new AutoProveCardController(scope);
				const disposeSlot = slots.inject("settings.section", () => slots.register({
					name: "settings.section",
					id: "auto-prove",
					order: 14,
					label: () => "自动允许",
					inject: () => controller.inject(),
				}, Section));
				return () => {
					disposeSlot();
					controller.dispose();
				};
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
