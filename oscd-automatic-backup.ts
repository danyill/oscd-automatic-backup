import { css, html, LitElement, PropertyValueMap, TemplateResult } from 'lit';
import { property, query } from 'lit/decorators.js';

import '@material/mwc-button';
import '@material/mwc-dialog';
import '@material/mwc-formfield';
import '@material/mwc-snackbar';
import '@material/mwc-textfield';

import type { Dialog } from '@material/mwc-dialog';
import type { Snackbar } from '@material/mwc-snackbar';
import type { TextField } from '@material/mwc-textfield';

function getFileName(docName: string): string {
  const currentDateTime = new Date();

  const year = currentDateTime.getFullYear();
  const month = String(currentDateTime.getMonth() + 1).padStart(2, '0');
  const day = String(currentDateTime.getDate()).padStart(2, '0');
  const hours = String(currentDateTime.getHours()).padStart(2, '0');
  const minutes = String(currentDateTime.getMinutes()).padStart(2, '0');
  const seconds = String(currentDateTime.getSeconds()).padStart(2, '0');

  const formattedDateTime = `${year}-${month}-${day}_${hours}${minutes}${seconds}`;

  const fileName = `Backup_${formattedDateTime}_${docName}`;
  return fileName;
}

/**
 * WebComponent for OpenSCD to allow automated periodic backups to
 * the local file system.
 */
export default class AutomaticBackup extends LitElement {
  /** The document being edited as provided to plugins by [[`OpenSCD`]]. */
  @property({ attribute: false })
  doc!: XMLDocument;

  @property()
  docName!: string;

  @property()
  editCount: number = -1;

  @property({ attribute: false })
  usedDirectory: string = '';

  @property({ attribute: false })
  userMessage: string = '';

  usedFileNames: string[] = [];

  @query('#dialog') dialogUI?: Dialog;

  @query('#interval') intervalUI?: TextField;

  @query('#count') countUI?: TextField;

  @query('#userMessage') userMessageUI?: Snackbar;

  @query('#diskUsage') diskUsageUI?: HTMLElement;

  timerId: number = 0;

  docByteSize: number = 0;

  cancelDialog: boolean = false;

  lastEditCount: number = -2;

  @property({ type: Boolean })
  enabled: boolean = false;

  @property({ type: Number })
  count: number = 12;

  @property({ type: Number })
  interval: number = 5;

  storeSettings(): void {
    localStorage.setItem('oscd-automatic-backup-enabled', `${this.enabled}`);
    localStorage.setItem('oscd-automatic-backup-interval', `${this.interval}`);
    localStorage.setItem('oscd-automatic-backup-count', `${this.count}`);
  }

  restoreSettings(): void {
    this.enabled =
      localStorage.getItem('oscd-automatic-backup-enabled') === 'true';
    this.count = parseInt(
      localStorage.getItem('oscd-automatic-backup-count') ?? '12',
      10
    );
    this.interval = parseInt(
      localStorage.getItem('oscd-automatic-backup-interval') ?? '5',
      10
    );
  }

  constructor() {
    super();

    // after edit occurs
    window.addEventListener('oscd-edit', () => {
      if (this.usedDirectory === '' && this.enabled) {
        this.userMessage = `You have automatic backups enabled but a directory has not been selected, 
        please either disable or choose a directory by going to Automatic Backups in the Menu.`;
        if (this.userMessageUI) this.userMessageUI!.show();
      }
    });
  }

  connectedCallback(): void {
    super.connectedCallback();
    // restore settings from local storage
    this.restoreSettings();
  }

  async run(): Promise<void> {
    this.docByteSize = new XMLSerializer().serializeToString(this.doc).length;
    this.calculateUsage();
    this.cancelDialog = false;

    this.intervalUI!.value = `${this.interval}`;
    this.countUI!.value = `${this.count}`;
    this.dialogUI!.show();
  }

  calculateUsage(): void {
    if (!this.diskUsageUI) return;

    const kBSize = parseInt(this.countUI?.value ?? '10', 10) * this.docByteSize;

    if (kBSize >= 1e6)
      this.diskUsageUI.innerText = `${(kBSize / 1e6).toFixed(2)} MB`;
    if (kBSize < 1e6)
      this.diskUsageUI.innerText = `${(kBSize / 1e3).toFixed(2)} kB`;
  }

  // TODO: unsure how to type the directory handle correctly
  async createBackup(directoryHandle: any) {
    if (!this.doc) return;

    // NOTE: It can be useful to comment the if statement
    // below if developing plugin without facility to cause edits.
    if (this.lastEditCount === this.editCount) {
      // don't save if no changes are made
      return;
    }
    this.lastEditCount = this.editCount;

    // remove file if we would go over count
    if (this.usedFileNames.length + 1 > this.count) {
      const fileToRemove = this.usedFileNames.shift()!;
      // delete
      try {
        await directoryHandle.removeEntry(fileToRemove);
      } catch {
        this.userMessage = `Unable to to remove oldest backup. 
      Check permissions.`;
        if (this.userMessageUI) this.userMessageUI!.show();
        return;
      }
    }

    try {
      const fileName = getFileName(this.docName);
      this.usedFileNames.push(fileName);
      const fileHandle = await directoryHandle.getFileHandle(fileName, {
        create: true,
      });

      const writableStream = await fileHandle.createWritable();
      await writableStream.write(
        new XMLSerializer().serializeToString(this.doc)
      );

      await writableStream.close();
    } catch (error) {
      this.userMessage = `Unable to to write to file system. 
      Check storage space and permissions.`;
      if (this.userMessageUI) this.userMessageUI!.show();
      return;
    }

    this.userMessage = `Backup created in ${this.usedDirectory}.`;
    if (this.userMessageUI) this.userMessageUI!.show();
  }

  protected firstUpdated(): void {
    this.dialogUI!.addEventListener('closed', async () => {
      if (this.cancelDialog) {
        return;
      }

      this.interval = parseInt(this.intervalUI?.value ?? '10', 10);
      this.count = parseInt(this.countUI?.value ?? '6', 10);

      // File System API feature exists
      if ('showDirectoryPicker' in window) {
        // TODO: How to type the File System API?
        const directoryHandle = await (<any>window.showDirectoryPicker)({
          id: 'oscd-automatic-backup',
          mode: 'readwrite',
          startIn: 'documents',
        });

        if (!directoryHandle) {
          // User cancelled, or otherwise failed to open a directory.
          this.userMessage = `Backup directory not correctly set. 
          Please open the Automatic Backup plugin and choose a folder.`;
          if (this.userMessageUI) this.userMessageUI!.show();
          return;
        }

        this.enabled = true;
        this.usedDirectory = directoryHandle?.name;

        window.clearInterval(this.timerId);
        this.timerId = window.setInterval(async () => {
          this.createBackup(directoryHandle);
        }, this.interval * 60000);

        this.userMessage = `While changes are being made, every ${this.interval} minute(s) 
        a backup will be taken, keeping the ${this.count} most recent backups.`;
        if (this.userMessageUI) this.userMessageUI!.show();
      } else {
        this.userMessage =
          'Sorry, your browser does not support the File System API required.';
        if (this.userMessageUI) this.userMessageUI!.show();
      }
    });
  }

  protected updated(
    changedProperties: PropertyValueMap<any> | Map<PropertyKey, unknown>
  ): void {
    // Update local storage for stored plugin settings
    const settingsUpdateRequired = Array.from(changedProperties.keys()).some(
      r => ['enabled', 'count', 'interval'].includes(r.toString())
    );
    if (settingsUpdateRequired) this.storeSettings();
  }

  render(): TemplateResult {
    return html`<mwc-dialog id="dialog" heading="Automatic Backup">
        <mwc-formfield alignEnd spaceBetween label="Interval">
          <mwc-textfield
            id="interval"
            min="1"
            max="99"
            maxLength="2"
            type="number"
            suffix="minutes"
            value="${this.interval}"
            @input=${() => this.calculateUsage()}
            required
          ></mwc-textfield>
        </mwc-formfield>
        <mwc-formfield alignEnd spaceBetween label="Maximum backups">
          <mwc-textfield
            id="count"
            min="1"
            max="99"
            maxLength="2"
            type="number"
            value="${this.count}"
            @input=${() => this.calculateUsage()}
            required
          ></mwc-textfield>
        </mwc-formfield>
        <mwc-formfield
          alignEnd
          spaceBetween
          label="Estimated disk space required"
          ><span id="diskUsage"></span
        ></mwc-formfield>
        ${this.enabled && this.usedDirectory !== ''
          ? html`<mwc-formfield alignEnd spaceBetween label="Backup location"
              ><span><code>${this.usedDirectory}</code> </span></mwc-formfield
            >`
          : ``}
        <mwc-button
          label="Choose Folder"
          slot="primaryAction"
          dialogAction="ok"
          icon="folder_open"
        ></mwc-button>
        <mwc-button
          label="Cancel"
          slot="secondaryAction"
          dialogAction="actual_cancel"
          @click=${() => {
            this.cancelDialog = true;
          }}
        ></mwc-button>
        <mwc-button
          label="Disable"
          slot="secondaryAction"
          dialogAction="disable"
          ?disabled=${!this.enabled}
          @click=${() => {
            this.enabled = false;
            this.cancelDialog = true;
            this.userMessage = `Automatic backups disabled.`;
            if (this.userMessageUI) this.userMessageUI!.show();
          }}
        ></mwc-button>
      </mwc-dialog>
      <mwc-snackbar
        id="userMessage"
        leading
        labelText="${this.userMessage}"
      ></mwc-snackbar> `;
  }

  static styles = css`
    :host {
      display: flex;
    }

    mwc-formfield {
      padding: 15px;
    }

    mwc-textfield {
      padding: 5px;
    }
  `;
}
