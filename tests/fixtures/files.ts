export function makeTextFile(contents = "hello world", name = "note.txt"): File {
    return new File([contents], name, { type: "text/plain" });
}

export function makeImageFile(name = "image.png"): File {
    return new File([new Uint8Array([137, 80, 78, 71])], name, { type: "image/png" });
}

export function makePdfFile(name = "document.pdf"): File {
    return new File(["%PDF-1.4"], name, { type: "application/pdf" });
}
