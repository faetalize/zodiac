export class MockDataTransfer {
	private readonly filesInternal: File[] = [];

	readonly types = ["Files"];

	readonly items = {
		add: (file: File) => {
			this.filesInternal.push(file);
		},
		[Symbol.iterator]: function* (this: MockDataTransfer) {
			for (const file of this.filesInternal) {
				yield {
					kind: "file",
					type: file.type,
					getAsFile: () => file
				};
			}
		}.bind(this)
	};

	get files(): FileList {
		return this.filesInternal as unknown as FileList;
	}
}

export function makeEmptyFileList(): FileList {
	return [] as unknown as FileList;
}

export function makeFileList(files: File[]): FileList {
	return files as unknown as FileList;
}
