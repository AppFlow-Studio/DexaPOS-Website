import { cn } from "@/lib/utils";
import React, { useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { IconUpload, IconX } from "@tabler/icons-react";
import { useDropzone } from "react-dropzone";
import { GridPattern } from "./file-upload"; // Reuse grid pattern

const mainVariant = {
  initial: {
    x: 0,
    y: 0,
  },
  animate: {
    x: 20,
    y: -20,
    opacity: 0.9,
  },
};

const secondaryVariant = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
  },
};

export const MultiFileUpload = ({
  onChange,
  value = [],
}: {
  onChange?: (files: File[]) => void;
  value?: File[];
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (newFiles: File[]) => {
    // Combine existing files with new files
    const updatedFiles = [...value, ...newFiles];
    onChange && onChange(updatedFiles);
  };
  
  const removeFile = (e: React.MouseEvent, indexToRemove: number) => {
    e.stopPropagation(); // Prevent opening file dialog
    const updatedFiles = value.filter((_, index) => index !== indexToRemove);
    onChange && onChange(updatedFiles);
  }

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const { getRootProps, isDragActive } = useDropzone({
    multiple: true,
    noClick: true,
    onDrop: (acceptedFiles) => handleFileChange(acceptedFiles),
    onDropRejected: (error) => {
      console.log(error);
    },
  });

  return (
    <div className="w-full" {...getRootProps()}>
      <motion.div
        onClick={handleClick}
        whileHover="animate"
        className="p-10 group/file block rounded-lg cursor-pointer w-full relative overflow-hidden"
      >
        <input
          ref={fileInputRef}
          id="file-upload-handle"
          type="file"
          multiple={true}
          onChange={(e) => {
            if (e.target.files) {
                handleFileChange(Array.from(e.target.files));
                // Reset input so same file selection works if needed
                e.target.value = ''; 
            }
          }}
          className="hidden"
        />
        <div className="absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,white,transparent)]">
          <GridPattern />
        </div>
        <div className="flex flex-col items-center justify-center">
          <p className="relative z-20 font-sans font-bold text-neutral-700 dark:text-neutral-300 text-base">
            Upload files
          </p>
          <p className="relative z-20 font-sans font-normal text-neutral-400 dark:text-neutral-400 text-base mt-2">
            Drag or drop your files here or click to upload
          </p>
          
          <div className="relative w-full mt-10 max-w-xl mx-auto flex flex-col gap-4">
            <AnimatePresence>
                {value.length > 0 && value.map((file, idx) => (
                    <motion.div
                        key={`${file.name}-${idx}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className={cn(
                        "relative overflow-hidden z-40 bg-white dark:bg-neutral-900 flex flex-col justify-center rounded-md p-4 shadow-sm border border-neutral-200 dark:border-neutral-800",
                        )}
                    >
                        <div className="flex justify-between items-center gap-4">
                            <div className="flex items-center gap-2 truncate">
                                <motion.p className="text-base text-neutral-700 dark:text-neutral-300 truncate max-w-xs">
                                    {file.name}
                                </motion.p>
                                <motion.p className="rounded-lg px-2 py-0.5 text-xs bg-gray-100 dark:bg-neutral-800 text-neutral-600 dark:text-white">
                                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                                </motion.p>
                            </div>
                            
                            <button 
                                onClick={(e) => removeFile(e, idx)}
                                className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-full transition-colors"
                            >
                                <IconX className="h-4 w-4 text-neutral-500" />
                            </button>
                        </div>
                         <div className="flex text-xs text-neutral-500 mt-1">
                             {file.type} • modified {new Date(file.lastModified).toLocaleDateString()}
                         </div>
                    </motion.div>
                ))}
            </AnimatePresence>

            {value.length === 0 && (
              <motion.div
                layoutId="file-upload"
                variants={mainVariant}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 20,
                }}
                className={cn(
                  "relative group-hover/file:shadow-2xl z-40 bg-white dark:bg-neutral-900 flex items-center justify-center h-32 mt-4 w-full max-w-[8rem] mx-auto rounded-md",
                  "shadow-[0px_10px_50px_rgba(0,0,0,0.1)]"
                )}
              >
                {isDragActive ? (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-neutral-600 flex flex-col items-center"
                  >
                    Drop it
                    <IconUpload className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
                  </motion.p>
                ) : (
                  <IconUpload className="h-4 w-4 text-neutral-600 dark:text-neutral-300" />
                )}
              </motion.div>
            )}

            {value.length === 0 && (
              <motion.div
                variants={secondaryVariant}
                className="absolute opacity-0 border border-dashed border-sky-400 inset-0 z-30 bg-transparent flex items-center justify-center h-32 mt-4 w-full max-w-[8rem] mx-auto rounded-md"
              ></motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
