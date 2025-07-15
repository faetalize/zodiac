import tippy from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import 'tippy.js/themes/material.css';

const tooltips = document.querySelectorAll('.tooltip');

for(const tooltip of tooltips){
    tippy(tooltip, {
        content: tooltip.getAttribute("info") || "",
        theme: "material",
        placement: "top",
        arrow: true,
    })
}