#!/usr/bin/perl

    use strict;
    use List::Util qw[min max];
    use POSIX;
    use CGI::Carp qw(fatalsToBrowser);

    use Digest::MD5;
    use Image::Magick;

    my $uploaddir = '../images';

    my $maxFileSize = 5 * 1024 * 1024; # 1/2mb max file size...

    use CGI;
    my $IN = new CGI;

    my $file;
    if ($IN->param('POSTDATA')) {
      $file = $IN->param('POSTDATA');
    } else {
      $file = $IN->upload('qqfile');
    }

    my $temp_id = $IN->param('temp_id');
 #make a random filename, and we guess the file type later on...
    my $filename = Digest::MD5::md5_base64( rand );
       $filename =~ s/\+/_/g;
       $filename =~ s/\//_/g;
    
    my $type;
    if ($file =~ /^GIF/) {
        $type = "gif";
    } elsif ($file =~ /JFIF/) {
        $type = "jpg";
    } elsif ($file =~ /PNG/) {
        $type = "png";
    }

    my $name = "$uploaddir/$filename.$type";

    if (!$type) {
        print qq|{ "success": false, "error": "Invalid file type..." }|;
        print STDERR "file has been NOT been uploaded... \n";
    }

    print STDERR "Making dir: $uploaddir/$temp_id \n";

    mkdir("$uploaddir/$temp_id");

    binmode(WRITEIT);
    open(WRITEIT, ">$name") or die "Cant write to $name. Reason: $!";
    if ($IN->param('POSTDATA')) {
        print WRITEIT $file;
    } else {
        while (<$file>) {
          print WRITEIT;
        }
    }
    close(WRITEIT);

    my $check_size = -s "$name";

    print STDERR qq|Main filesize: $check_size  Max Filesize: $maxFileSize \n\n|;

        my $image = Image::Magick->new;
        open(IMAGE, $name) or die "Cant read $name. Reason: $!";
  	$image->Read(file=>\*IMAGE);
  	close(IMAGE);

	(my $width, my $height) = $image->Get('width','height');
        my $size = min($width, $height);
	$image->Crop(geometry=>"${size}x$size+0+0");
	
	my $newsize = 2 ** floor(log($size) / log(2));
    	print STDERR "size $size newsize $newsize\n";
	$image->Resize(height=>$newsize, width=>$newsize);

	my $newname = "$uploaddir/$filename.jpg";
  	open(IMAGE, ">$newname");
  	$image->Write(file=>\*IMAGE, filename=>$newname, quality=>90);
  	close(IMAGE);

	$name = $newname;

    print $IN->header();
    if ($check_size < 1) {
        print STDERR "ooops, its empty - gonna get rid of it!\n";
        print qq|{ "success": false, "error": "File is empty..." }|;
        print STDERR "file has been NOT been uploaded... \n";
    } elsif ($check_size > $maxFileSize) {
        print STDERR "ooops, its too large - gonna get rid of it!\n";
        print qq|{ "success": false, "error": "File is too large..." }|;
        print STDERR "file has been NOT been uploaded... \n";
    } else  {
        print qq|{ "success": true, "file": "$filename.jpg" }|;

        print STDERR "file has been successfully uploaded... thank you.\n";
    }
