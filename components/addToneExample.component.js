function setup(btn) {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        const input = document.createElement('input');
        input.type = 'text';
        input.name = `tone-example-${document.querySelectorAll('.tone-example').length + 1}`;
        input.classList.add('tone-example');
        input.placeholder = 'Tone example';
        btn.before(input);
    });
}

const btns = document.getElementsByClassName('btn-add-tone-example');
for (const btn of btns) {
    setup(btn);
}