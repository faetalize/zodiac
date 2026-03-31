export class MockDataTransfer {
    private readonly filesInternal: File[] = [];

    readonly items = {
        add: (file: File) => {
            this.filesInternal.push(file);
        },
    };

    get files(): FileList {
        return this.filesInternal as unknown as FileList;
    }
}

export function makeEmptyFileList(): FileList {
    return [] as unknown as FileList;
}
