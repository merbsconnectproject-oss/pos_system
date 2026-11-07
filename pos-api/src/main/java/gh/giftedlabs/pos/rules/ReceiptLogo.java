package gh.giftedlabs.pos.rules;

import java.awt.Image;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.util.Optional;

import javax.imageio.ImageIO;

/**
 * A stored logo, reduced to the dots a thermal head can fire — FR-SET-01.
 *
 * <p>A print head has one ink and no greys: every dot is either fired or not.
 * Handing a printer a photograph and hoping is how a logo comes out as a black
 * rectangle, so the conversion is done here, deliberately, and is the same
 * conversion for every roll width.
 *
 * <p>Pure: bytes in, bitmap out, no printer and no database. A logo that cannot
 * be decoded — an SVG, a corrupt upload — yields nothing rather than throwing.
 * A receipt still has to print when the logo does not.
 */
public final class ReceiptLogo {

    /** A header, not a billboard. Roughly 15mm of roll at 203 dpi. */
    private static final int MAX_HEIGHT_DOTS = 120;

    /**
     * Mid-grey. Logos are usually dark on transparent or white, and a threshold
     * at the midpoint keeps thin strokes without filling in the background.
     */
    private static final int THRESHOLD = 140;

    private ReceiptLogo() {
    }

    /**
     * Scales and thresholds an uploaded image for the given roll.
     *
     * @param image the stored bytes, in whatever format they were uploaded
     * @return the bitmap, or empty when the bytes are not an image this JVM
     *         decodes — which is not an error at the counter
     */
    public static Optional<ReceiptLayout.Logo> from(byte[] image, ReceiptWidth width) {
        if (image == null || image.length == 0) return Optional.empty();

        BufferedImage source;
        try {
            source = ImageIO.read(new ByteArrayInputStream(image));
        } catch (Exception ex) {
            return Optional.empty();
        }
        if (source == null || source.getWidth() <= 0 || source.getHeight() <= 0) {
            return Optional.empty();
        }

        // The head is a fixed number of dots across; the logo is fitted to it
        // rather than to a number of millimetres, because millimetres are not
        // what the printer is counting.
        int maxWidth = width.logoDots();
        double scale = Math.min(
                (double) maxWidth / source.getWidth(),
                (double) MAX_HEIGHT_DOTS / source.getHeight());
        // Never blown up. An enlarged 64px logo is a blurred one, and blur
        // thresholds into ragged dots.
        scale = Math.min(scale, 1.0);

        int dotsWide = Math.max(1, (int) Math.round(source.getWidth() * scale));
        int dotsHigh = Math.max(1, (int) Math.round(source.getHeight() * scale));

        // Drawn onto white first, so a transparent PNG — which is most logos —
        // thresholds against the paper rather than against black.
        BufferedImage scaled = new BufferedImage(dotsWide, dotsHigh, BufferedImage.TYPE_INT_RGB);
        var canvas = scaled.createGraphics();
        try {
            canvas.setColor(java.awt.Color.WHITE);
            canvas.fillRect(0, 0, dotsWide, dotsHigh);
            canvas.drawImage(source.getScaledInstance(dotsWide, dotsHigh, Image.SCALE_SMOOTH),
                    0, 0, null);
        } finally {
            canvas.dispose();
        }

        return Optional.of(new ReceiptLayout.Logo(dotsWide, dotsHigh, pack(scaled)));
    }

    /** Row-major, one bit per dot, high bit leftmost, 1 = fire. */
    private static byte[] pack(BufferedImage image) {
        int bytesPerRow = (image.getWidth() + 7) / 8;
        byte[] bitmap = new byte[bytesPerRow * image.getHeight()];

        for (int y = 0; y < image.getHeight(); y++) {
            for (int x = 0; x < image.getWidth(); x++) {
                int rgb = image.getRGB(x, y);
                int luminance = (((rgb >> 16) & 0xFF) * 299
                        + ((rgb >> 8) & 0xFF) * 587
                        + (rgb & 0xFF) * 114) / 1000;
                if (luminance < THRESHOLD) {
                    bitmap[y * bytesPerRow + (x / 8)] |= (byte) (0x80 >> (x % 8));
                }
            }
        }
        return bitmap;
    }
}
