import { LitElement, TemplateResult } from 'lit';
import '@material/mwc-button';
import '@material/mwc-dialog';
import '@material/mwc-formfield';
import '@material/mwc-snackbar';
import '@material/mwc-switch';
import '@material/mwc-textfield';
import type { Dialog } from '@material/mwc-dialog';
import type { Snackbar } from '@material/mwc-snackbar';
import type { Switch } from '@material/mwc-switch';
import type { TextField } from '@material/mwc-textfield';
export default class AutomaticBackup extends LitElement {
    /** The document being edited as provided to plugins by [[`OpenSCD`]]. */
    doc: XMLDocument;
    docname: string;
    usedDirectory: string;
    usedFileNames: string[];
    dialogUI?: Dialog;
    enabledUI?: Switch;
    intervalUI?: TextField;
    countUI?: TextField;
    messageActiveUI?: Snackbar;
    messageBackupTakenUI?: Snackbar;
    messageNotSupportedUI?: Snackbar;
    diskUsageUI?: HTMLElement;
    timerId: number;
    docByteSize: number;
    cancelDialog: boolean;
    applicationInactive: boolean;
    set enabled(state: boolean);
    get enabled(): boolean;
    set interval(interval: number);
    get interval(): number;
    set count(count: number);
    get count(): number;
    constructor();
    run(): Promise<void>;
    calculateUsage(): void;
    protected firstUpdated(): void;
    render(): TemplateResult;
    static styles: import("lit").CSSResult;
}
