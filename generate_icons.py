from PIL import Image, ImageDraw, ImageFont
import os

BG_COLOR = "#2196F3"
BOX_COLOR = "#FFFFFF"

SIZES = [72, 96, 128, 144, 152, 192, 384, 512]


def create_icon(size):
    """生成一个 size x size 的图标，圆形背景+白色盒子"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 圆形背景
    padding = max(1, size // 32)
    draw.ellipse(
        [padding, padding, size - padding, size - padding],
        fill=BG_COLOR
    )

    # 盒子主体（白色圆角矩形，用椭圆+矩形模拟圆角）
    margin = size // 4
    box_left = margin
    box_top = margin + size // 16
    box_right = size - margin
    box_bottom = size - margin + size // 16
    corner = max(2, size // 32)

    # 主体矩形
    draw.rectangle(
        [box_left + corner, box_top, box_right - corner, box_bottom],
        fill=BOX_COLOR
    )
    draw.rectangle(
        [box_left, box_top + corner, box_right, box_bottom - corner],
        fill=BOX_COLOR
    )
    # 四个圆角
    draw.ellipse([box_left, box_top, box_left + corner * 2, box_top + corner * 2], fill=BOX_COLOR)
    draw.ellipse([box_right - corner * 2, box_top, box_right, box_top + corner * 2], fill=BOX_COLOR)
    draw.ellipse([box_left, box_bottom - corner * 2, box_left + corner * 2, box_bottom], fill=BOX_COLOR)
    draw.ellipse([box_right - corner * 2, box_bottom - corner * 2, box_right, box_bottom], fill=BOX_COLOR)

    # 盒盖
    lid_height = max(2, size // 10)
    lid_overhang = size // 20
    lid_top = box_top - lid_height // 2
    lid_bottom = box_top + lid_height
    lid_left = box_left - lid_overhang
    lid_right = box_right + lid_overhang

    draw.rectangle(
        [lid_left + corner, lid_top, lid_right - corner, lid_bottom],
        fill=BOX_COLOR
    )
    draw.rectangle(
        [lid_left, lid_top + corner, lid_right, lid_bottom - corner],
        fill=BOX_COLOR
    )
    draw.ellipse([lid_left, lid_top, lid_left + corner * 2, lid_top + corner * 2], fill=BOX_COLOR)
    draw.ellipse([lid_right - corner * 2, lid_top, lid_right, lid_top + corner * 2], fill=BOX_COLOR)
    draw.ellipse([lid_left, lid_bottom - corner * 2, lid_left + corner * 2, lid_bottom], fill=BOX_COLOR)
    draw.ellipse([lid_right - corner * 2, lid_bottom - corner * 2, lid_right, lid_bottom], fill=BOX_COLOR)

    # 盒盖中间缝隙线
    line_y = lid_top + lid_height // 2
    line_thick = max(1, size // 64)
    draw.rectangle(
        [box_left + size // 10, line_y - line_thick // 2,
         box_right - size // 10, line_y + line_thick // 2],
        fill=BG_COLOR
    )

    # 盒子正面的小标签
    tag_w = size // 6
    tag_h = size // 8
    tag_x = (box_left + box_right) // 2 - tag_w // 2
    tag_y = (box_top + box_bottom) // 2 - tag_h // 2 + size // 32
    draw.rectangle(
        [tag_x + corner, tag_y, tag_x + tag_w - corner, tag_y + tag_h],
        fill=BG_COLOR
    )
    draw.rectangle(
        [tag_x, tag_y + corner, tag_x + tag_w, tag_y + tag_h - corner],
        fill=BG_COLOR
    )
    draw.ellipse([tag_x, tag_y, tag_x + corner * 2, tag_y + corner * 2], fill=BG_COLOR)
    draw.ellipse([tag_x + tag_w - corner * 2, tag_y, tag_x + tag_w, tag_y + corner * 2], fill=BG_COLOR)
    draw.ellipse([tag_x, tag_y + tag_h - corner * 2, tag_x + corner * 2, tag_y + tag_h], fill=BG_COLOR)
    draw.ellipse([tag_x + tag_w - corner * 2, tag_y + tag_h - corner * 2, tag_x + tag_w, tag_y + tag_h], fill=BG_COLOR)

    # 标签中间一条小横杠
    dash_thick = max(1, size // 80)
    dash_y = tag_y + tag_h // 2
    draw.rectangle(
        [tag_x + tag_w // 4, dash_y - dash_thick // 2,
         tag_x + tag_w * 3 // 4, dash_y + dash_thick // 2],
        fill=BOX_COLOR
    )

    return img


def main():
    out_dir = os.path.dirname(os.path.abspath(__file__))
    for s in SIZES:
        icon = create_icon(s)
        filename = f"icon-{s}.png"
        path = os.path.join(out_dir, filename)
        icon.save(path, "PNG")
        print(f"Saved {filename}")

    # apple-touch-icon
    icon = create_icon(180)
    icon.save(os.path.join(out_dir, "apple-touch-icon.png"), "PNG")
    print("Saved apple-touch-icon.png")

    # favicon
    icon = create_icon(64)
    icon.save(os.path.join(out_dir, "favicon.png"), "PNG")
    print("Saved favicon.png")


if __name__ == "__main__":
    main()
