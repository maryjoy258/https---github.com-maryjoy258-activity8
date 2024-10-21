import { Component } from '@angular/core';

@Component({
  selector: 'app-text-formatter',
  templateUrl: './text-formatter.component.html',
})
export class TextFormatterComponent {
  text: string = '';
  formattedText: string = '';

  formatText(style: string) {
    switch (style) {
      case 'bold':
        this.formattedText = `<strong>${this.text}</strong>`;
        break;
      case 'italic':
        this.formattedText = `<em>${this.text}</em>`;
        break;
      case 'underline':
        this.formattedText = `<u>${this.text}</u>`;
        break;
      default:
        this.formattedText = this.text;
    }
  }
}
