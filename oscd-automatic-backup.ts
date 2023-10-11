import { css, html, LitElement, TemplateResult } from 'lit';
import { property, query } from 'lit/decorators.js';

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

// TODO: Why can't I type this thing correctly :-(
// It makes me very sad and angry and sad and angry and sad.
// import type { FileSystemDirectoryHandle } from 'wicg-file-system-access';

function getFileName(docName: string): string {
  const currentDateTime = new Date();

  // Extract the individual date and time components
  const year = currentDateTime.getFullYear();
  const month = String(currentDateTime.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
  const day = String(currentDateTime.getDate()).padStart(2, '0');
  const hours = String(currentDateTime.getHours()).padStart(2, '0');
  const minutes = String(currentDateTime.getMinutes()).padStart(2, '0');
  const seconds = String(currentDateTime.getSeconds()).padStart(2, '0');

  // Format the date and time string
  const formattedDateTime = `${year}-${month}-${day}_${hours}${minutes}${seconds}`;

  const fileName = `Backup_${formattedDateTime}_${docName}`;
  return fileName;
}

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

  usedFileNames: string[] = [];

  @query('#dialog') dialogUI?: Dialog;

  @query('#enabled') enabledUI?: Switch;

  @query('#interval') intervalUI?: TextField;

  @query('#count') countUI?: TextField;

  @query('#automaticBackupActive') messageActiveUI?: Snackbar;

  @query('#automaticBackupTaken') messageBackupTakenUI?: Snackbar;

  @query('#sorryNotSupported') messageNotSupportedUI?: Snackbar;

  @query('#diskUsage') diskUsageUI?: HTMLElement;

  timerId: number = 0;

  docByteSize: number = 0;

  cancelDialog: boolean = false;

  lastEditCount: number = -2;

  set enabled(state: boolean) {
    const oldVal = this.enabled;
    localStorage.setItem('oscd-automatic-backup-enabled', `${state}`);
    this.requestUpdate('enabled', oldVal);
  }

  // eslint-disable-next-line class-methods-use-this
  @property()
  get enabled() {
    return localStorage.getItem('oscd-automatic-backup-enabled') === 'true';
  }

  set interval(interval: number) {
    const oldVal = this.interval;
    localStorage.setItem('oscd-automatic-backup-interval', `${interval}`);
    this.requestUpdate('enabled', oldVal);
  }

  // eslint-disable-next-line class-methods-use-this
  @property()
  get interval() {
    return parseInt(
      localStorage.getItem('oscd-automatic-backup-interval') ?? '10',
      10
    );
  }

  set count(count: number) {
    const oldVal = this.count;
    localStorage.setItem('oscd-automatic-backup-count', `${count}`);
    this.requestUpdate('count', oldVal);
  }

  // eslint-disable-next-line class-methods-use-this
  @property()
  get count() {
    return parseInt(
      localStorage.getItem('oscd-automatic-backup-count') ?? '10',
      10
    );
  }

  async run(): Promise<void> {
    this.docByteSize = new XMLSerializer().serializeToString(this.doc).length;
    this.calculateUsage();
    this.cancelDialog = false;

    // return new Promise(resolve => {
    this.dialogUI!.show();

    // })
  }

  calculateUsage(): void {
    if (!this.diskUsageUI) return;

    if (!this.enabledUI?.selected && !(<any>this.enabledUI!).checked) {
      this.diskUsageUI.innerText = 'None';
      return;
    }

    const kBSize = parseInt(this.countUI?.value ?? '10', 10) * this.docByteSize;

    if (kBSize >= 1e6)
      this.diskUsageUI.innerText = `${(kBSize / 1e6).toFixed(2)} MB`;
    if (kBSize < 1e6)
      this.diskUsageUI.innerText = `${(kBSize / 1e3).toFixed(2)} kB`;
  }

  protected firstUpdated(): void {
    this.dialogUI!.addEventListener('closed', async () => {
      if (this.cancelDialog) {
        return;
      }
      // File System API feature exists
      if ('showDirectoryPicker' in window) {
        if (!this.enabled) return;

        const directoryHandle = await window.showDirectoryPicker({
          id: 'oscd-automatic-backup',
          mode: 'readwrite',
          startIn: 'documents',
        });

        this.usedDirectory = directoryHandle.name;

        window.clearInterval(this.timerId);
        this.timerId = window.setInterval(async () => {
          if (!this.doc) return;

          // don't keep saving if the application if no changes are made
          if (this.lastEditCount === this.editCount) {
            console.info(
              'No document changes, no new backup created',
              this.lastEditCount,
              this.editCount
            );
            return;
          }
          this.lastEditCount = this.editCount;

          // remove file if we would breach the limit
          if (this.usedFileNames.length + 1 > this.count) {
            const fileToRemove = this.usedFileNames.shift()!;
            // delete
            await directoryHandle.removeEntry(fileToRemove);
          }

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

          this.messageBackupTakenUI?.show();
        }, this.interval * 60000);

        this.messageActiveUI?.show();
      } else {
        this.messageNotSupportedUI?.show();
      }
    });
  }

  // TODO: Update URL when subscriber later binding is shepherded by OpenSCD organisation
  render(): TemplateResult {
    return html`<mwc-dialog id="dialog" heading="Automatic Backup">
        <mwc-formfield alignEnd spaceBetween label="Backup interval (minutes)">
          <mwc-textfield
            id="interval"
            min="1"
            max="99"
            maxLength="2"
            type="number"
            value="${this.interval}"
            @input=${() => this.calculateUsage()}
            required
          ></mwc-textfield>
        </mwc-formfield>
        <mwc-formfield alignEnd spaceBetween label="Maximum Number of backups">
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

        <mwc-formfield alignEnd spaceBetween label="Enable Automatic Backup">
          <!-- TODO: Remove ?checked when open-scd uses later version of mwc-components -->
          <mwc-switch
            id="enabled"
            ?selected=${this.enabled}
            ?checked=${this.enabled}
            @click=${() => {
              this.enabled =
                this.enabledUI?.selected ||
                (<any>this.enabledUI!).checked ||
                false;
              this.calculateUsage();
            }}
          >
          </mwc-switch>
        </mwc-formfield>
        ${this.enabled
          ? html`<mwc-formfield alignEnd spaceBetween label="Backup location"
              ><span>${this.usedDirectory}</span></mwc-formfield
            >`
          : ``}
        <mwc-button
          label="Choose Folder"
          slot="primaryAction"
          dialogAction="ok"
          icon="folder_open"
          ?disabled=${!this.enabled}
          @click=${async () => {
            // TODO: Remove when open-scd uses later version of mwc-components.
            this.enabled =
              this.enabledUI!.selected ??
              (<any>this.enabledUI!).checked ??
              false;

            this.interval = parseInt(this.intervalUI?.value ?? '10', 10);
            this.count = parseInt(this.countUI?.value ?? '6', 10);
          }}
        ></mwc-button>
        <mwc-button
          label="Cancel"
          slot="secondaryAction"
          dialogAction="actual_cancel"
          @click=${() => {
            this.cancelDialog = true;
          }}
        ></mwc-button>
      </mwc-dialog>
      <mwc-snackbar
        id="automaticBackupTaken"
        leading
        labelText="Backup created in ${this.usedDirectory}."
      >
      </mwc-snackbar>
      <mwc-snackbar
        id="automaticBackupActive"
        leading
        labelText="Every ${this
          .interval} minute(s) a backup will be taken, retaining the ${this
          .count} most recent backups."
      >
      </mwc-snackbar>
      <mwc-snackbar
        id="sorryNotSupported"
        leading
        labelText="Sorry, your browser does not support the File System API required."
      >
      </mwc-snackbar> `;
  }

  static styles = css`
    mwc-formfield {
      padding: 15px;
      width: 350px;
    }
  `;
}
