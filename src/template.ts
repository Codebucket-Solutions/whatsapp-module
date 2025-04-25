import axios from 'axios';
import { ComponentDef, TemplateDef, TemplateVariables, Mode } from './types';
import { cleanTemplateText, validateTemplateText } from './utils';

const templateCache = new Map<string, TemplateDef>();

async function fetchTemplate(
    businessAccountId: string,
    accessToken: string,
    templateName: string,
    language = 'en'
): Promise<TemplateDef> {
    const key = `${businessAccountId}::${templateName}::${language}`;
    if (templateCache.has(key)) return templateCache.get(key)!;
    const resp = await axios.get(
        `https://graph.facebook.com/v22.0/${businessAccountId}/message_templates`,
        { params: {status: 'APPROVED', name: templateName, language },
            headers: {Authorization: `Bearer ${accessToken}`,} },
    );
    const data = resp.data.data as any[];
    if (!data.length) throw new Error(`Template '${templateName}' not found.`);
    const tpl = data[0];
    const def: TemplateDef = { name: tpl.name, language: tpl.language, components: tpl.components as ComponentDef[] };
    templateCache.set(key, def);
    return def;
}


function detectMode(keys: string[]): Mode {
    if (!keys.length) return Mode.NUMERIC;
    return keys.every(k => /^\d+$/.test(k)) ? Mode.NUMERIC : Mode.NAMED;
}


function isStructured(
    vars: TemplateVariables
): vars is { header?: string; body?: Record<string,string>; buttons?: string[] } {
    return (
        !Array.isArray(vars) &&
        (vars.header !== undefined ||
            vars.body   !== undefined ||
            vars.buttons!== undefined)
    )
}

export function extractKeys(components: ComponentDef[]): string[] {
    const bodyText = components.find(c=>c.type==='BODY'&&c.text)?.text||''
    const regex = /\{\{(\w+)\}\}/g
    const keys: string[] = []
    let m: RegExpExecArray|null
    while ((m = regex.exec(bodyText)) !== null) {
        if (!keys.includes(m[1])) keys.push(m[1])
    }
    return keys
}

export function normalizeVariables(
    vars: TemplateVariables,
    mode: Mode,
    keys: string[]
): { variables: TemplateVariables; warnings: string[] } {
    const warnings: string[] = []

    // 1) FLAT ARRAY INPUT
    if (Array.isArray(vars)) {
        // find how many body placeholders we expect
        const bodyCount = keys.length
        // detect if first item is a media header (we'd need access to components for that
        // but simplest heuristic: if mode===NUMERIC and vars.length > bodyCount+? then assume header)
        const hasHeader = mode === Mode.NUMERIC && vars.length > bodyCount +  // buttons?
            bodyCount
        const headerSliceLen = hasHeader ? 1 : 0

        // slice out the body segment
        const bodyRaw = vars.slice(headerSliceLen, headerSliceLen + bodyCount)
        const bodyClean: string[] = bodyRaw.map((raw, i) => {
            const vs = validateTemplateText(raw)
            vs.forEach(w => warnings.push(`Placeholder #${i+1}: ${w}`))
            return cleanTemplateText(raw)
        })

        // rebuild the flat array: [ …headerRaw, …bodyClean, …buttonsRaw ]
        return {
            variables: [
                ...vars.slice(0, headerSliceLen),    // raw header
                ...bodyClean,                        // cleaned body
                ...vars.slice(headerSliceLen + bodyCount) // raw buttons
            ],
            warnings
        }
    }

    // 2) STRUCTURED INPUT { header?, body?, buttons? }
    //    – header is untouched
    //    – buttons are untouched
    //    – only clean/validate body[key]
    const struct = vars as { header?:string; body?:Record<string,string>; buttons?:string[] }
    const cleanBody: Record<string,string> = {}
    keys.forEach(key => {
        const raw = struct.body?.[key] ?? ''
        const vs  = validateTemplateText(raw)
        vs.forEach(w => warnings.push(`Variable "${key}": ${w}`))
        cleanBody[key] = cleanTemplateText(raw)
    })

    return {
        variables: {
            header:  struct.header,   // raw, no cleaning
            body:    cleanBody,       // cleaned named placeholders
            buttons: struct.buttons   // raw, no cleaning
        },
        warnings
    }
}

export function buildComponents(
    components: ComponentDef[],
    variables: TemplateVariables,
    mode:       Mode,
    keys:       string[]
): any[] {
    // ── 1) Figure out your header value ───────────────────────────────────────────
    const headerVal = isStructured(variables) && variables.header !== undefined
        ? variables.header
        : Array.isArray(variables)
            ? variables[0]
            : undefined

    // ── 2) Positional flat array (for numeric & fallback) ────────────────────────
    const positionalArr: string[] = Array.isArray(variables)
        ? variables
        : mode === Mode.NUMERIC
            ? Object.keys(variables)
                .filter(k => /^\d+$/.test(k))
                .sort((a,b) => +a - +b)
                .map(k => (variables as Record<string,string>)[k] ?? '')
            : []

    // ── 3) Body values ───────────────────────────────────────────────────────────
    const bodyVals: string[] = isStructured(variables) && variables.body
        ? // structured named-body
        keys.map(k => variables.body![k] ?? '')
        : mode === Mode.NAMED
            ? // raw record→array
            keys.map(k => (variables as Record<string,string>)[k] ?? '')
            : // positional slice after header
            positionalArr.slice(headerVal != null ? 1 : 0, (headerVal != null ? 1 : 0) + keys.length)

    // ── 4) Button values ─────────────────────────────────────────────────────────
    const buttonVals: string[] = isStructured(variables) && Array.isArray(variables.buttons)
        ? variables.buttons!
        : positionalArr.slice((headerVal != null ? 1 : 0) + bodyVals.length)

    // ── 5) Build each component ─────────────────────────────────────────────────
    return components.map(comp => {
        switch (comp.type) {
            case 'HEADER':
                // — Media header? —
                if (comp.format && comp.format !== 'TEXT' && headerVal) {
                    const mtype = comp.format.toLowerCase()
                    const param: any = { type: mtype }
                    if (/^https?:\/\//.test(headerVal)) {
                        param[mtype] = { link: headerVal }
                    } else {
                        param[mtype] = { id: headerVal }
                    }
                    return { type: 'header', parameters: [param] }
                }
                // — Text header placeholders —
                if (comp.text?.includes('{{')) {
                    if (mode === Mode.NAMED) {
                        return {
                            type: 'header',
                            parameters: keys.map(name => ({
                                type:           'text',
                                parameter_name: name,
                                text:           (variables as any).body?.[name] ?? ''
                            }))
                        }
                    }
                    return {
                        type: 'header',
                        parameters: (Array.isArray(variables) ? positionalArr : bodyVals)
                            .map(t => ({ type: 'text', text: t }))
                    }
                }
                // — Static header —
                return { type: 'header' }

            case 'BODY':
                if (mode === Mode.NAMED) {
                    return {
                        type: 'body',
                        parameters: keys.map(name => ({
                            type:           'text',
                            parameter_name: name,
                            text:           (variables as any).body?.[name] ?? ''
                        }))
                    }
                }
                return {
                    type: 'body',
                    parameters: bodyVals.map(t => ({ type: 'text', text: t }))
                }

            case 'BUTTON':
                const idx = comp.index ?? 0
                const text = buttonVals[idx] ?? ''
                return {
                    type:      'button',
                    sub_type:  comp.sub_type?.toLowerCase(),
                    index:     idx,
                    parameters:[{ type:'text', text }]
                }

            default:
                return { type: comp.type.toLowerCase() }
        }
    })
}

/**
 * Creates a template payload and returns payload plus validation warnings.
 */
export async function createWhatsAppTemplatePayload(opts: {
    businessAccountId: string,
    accessToken: string,
    to: string,
    templateName: string,
    language?: string,
    variables: TemplateVariables
}): Promise<{ payload: any, warnings: string[] }> {
    const tpl = await fetchTemplate(opts.businessAccountId, opts.accessToken, opts.templateName, opts.language);
    const keys = extractKeys(tpl.components);
    const mode = detectMode(keys);
    const { variables, warnings } = normalizeVariables(opts.variables, mode, keys);
    const comps = buildComponents(tpl.components, variables, mode,keys);
    const payload = { recipient_type:'individual', to:opts.to, type:'template', template:{name:tpl.name,language:{code:tpl.language},components:comps} };
    return { payload, warnings };
}