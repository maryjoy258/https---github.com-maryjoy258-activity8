import { Component } from '@angular/core';

@Component({
  selector: 'app-binary-converter',
  templateUrl: './binary-converter.component.html',
})
export class BinaryConverterComponent {
  decimal: number | null = null;
  binary: string = '';

  convertToBinary() {
    if (this.decimal !== null) {
      this.binary = (this.decimal >>> 0).toString(2);
    }
  }
}
