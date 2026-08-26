
import { TFile, TFolder } from 'obsidian';
// ── World ─────────────────────────────────────────────────────────────────────

export interface WorldInfo {
    name: string;
    path: string;
    folder: TFolder;
    indexFile: TFile;
    status: 'active' | 'inactive';
    templateSet: string;	
    worldTemplate: string[];
}
