import { Component } from '@angular/core';

@Component({
  selector: 'app-picture-resizer',
  templateUrl: './picture-resizer.component.html',
})
export class PictureResizerComponent {
  width: number | null = null;
  height: number | null = null;
  imageUrl: string = '';

  resizeImage() {
    // Placeholder for resizing logic
    alert(`Resize image to ${this.width} x ${this.height}`);
  }
}
